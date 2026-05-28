const fs = require('fs');
const axios = require('axios');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

const COL = {
    year: 0, originalTitle: 1, russianTitle: 2, genre: 3, description: 4,
    kinoriumLink: 5, kinopoiskLink: 6, ratingKP: 7, ratingIMDb: 8,
    actors: 9, premiere: 10, country: 11, director: 12, fileName: 13,
    duration: 14, size: 15, resolution: 16, audio: 17, videoCodec: 18,
    bitrate: 19, subtitles: 20, yandexFolder: 21
};

// Парсим CSV с сохранением переносов строк
function parseCSVPreserveNewlines(csvText) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            currentRow.push(currentField);
            currentField = '';
        } else if (char === '\n' && !inQuotes) {
            currentRow.push(currentField);
            rows.push(currentRow);
            currentRow = [];
            currentField = '';
        } else {
            currentField += char;
        }
    }
    
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        rows.push(currentRow);
    }
    
    // Очищаем от лишних кавычек
    return rows.map(row => row.map(field => field.replace(/^"|"$/g, '').trim()));
}

function cleanValue(v) { 
    if (!v || v === '—' || v === '-') return ''; 
    return v; 
}

function isRealMovie(title) {
    if (!title) return false;
    if (title.length < 3) return false;
    
    const titleLower = title.toLowerCase();
    
    const garbagePatterns = [
        /кбит\/с/, /kbps/, /khz/, /channels?/, /ac-?\d/, /ac3/, /dts/,
        /mp3/, /aac/, /stereo/, /mono/, /h\.?264/, /xvid/, /divx/, /mpeg/,
        /subrip/, /оригинал/, /dvo/, /mvo/, /avo/, /озвучк/i, /дубляж/i,
        /^\d/, /^eng\b/i, /^rus\b/i, /трек/i, /audio/i
    ];
    
    for (const pattern of garbagePatterns) {
        if (pattern.test(titleLower)) return false;
    }
    
    return true;
}

async function buildMoviesCache() {
    console.log("🔄 Построение кеша фильмов...");
    
    let posters = {};
    try {
        const postersContent = fs.readFileSync('posters.json', 'utf8');
        posters = JSON.parse(postersContent).posters || {};
        console.log(`📸 Загружено ${Object.keys(posters).length} постеров`);
    } catch(e) { console.log("📸 Постеры не найдены"); }
    
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    const response = await axios.get(csvUrl);
    const rows = parseCSVPreserveNewlines(response.data);
    console.log(`📊 Всего строк: ${rows.length}`);
    
    const movies = [];
    let skipped = 0;
    
    for (let i = 1; i < rows.length; i++) {
        const parts = rows[i];
        if (parts.length < 3) { skipped++; continue; }
        
        const getVal = (idx) => idx < parts.length ? cleanValue(parts[idx]) : '';
        
        let title = getVal(COL.russianTitle);
        
        if (!title || !isRealMovie(title)) {
            skipped++;
            continue;
        }
        
        // Многострочные поля — сохраняем как есть (с переносами)
        let audioInfo = getVal(COL.audio);
        let subtitles = getVal(COL.subtitles);
        
        // Если поле содержит переносы строк, оставляем их
        // В HTML они преобразуются в <br> или разбиваются на строки
        
        const yearRaw = getVal(COL.year);
        const year = yearRaw.match(/\d{4}/)?.[0] || '';
        
        let ratingKP = getVal(COL.ratingKP);
        if (ratingKP && !ratingKP.match(/^\d+[,.]?\d*$/)) {
            const m = ratingKP.match(/(\d+[,.]?\d*)/);
            ratingKP = m ? m[1].replace(',', '.') : '';
        }
        
        let ratingIMDb = getVal(COL.ratingIMDb);
        if (ratingIMDb && !ratingIMDb.match(/^\d+[,.]?\d*$/)) {
            const m = ratingIMDb.match(/(\d+[,.]?\d*)/);
            ratingIMDb = m ? m[1].replace(',', '.') : '';
        }
        
        const cacheKey = `${title}_${year || 'no-year'}`;
        const posterData = posters[cacheKey];
        
        movies.push({
            id: i,
            title: title,
            originalTitle: getVal(COL.originalTitle),
            year: year,
            genre: getVal(COL.genre),
            description: getVal(COL.description),
            kinopoiskLink: getVal(COL.kinopoiskLink),
            ratingKP: ratingKP,
            ratingIMDb: ratingIMDb,
            actors: getVal(COL.actors),
            country: getVal(COL.country),
            director: getVal(COL.director),
            duration: getVal(COL.duration),
            size: getVal(COL.size),
            resolution: getVal(COL.resolution),
            audioInfo: audioInfo,
            subtitles: subtitles,
            fileName: getVal(COL.fileName),
            yandexFolder: getVal(COL.yandexFolder),
            posterUrl: posterData ? posterData.posterUrl : null
        });
        
        if (movies.length <= 3) {
            console.log(`✅ Фильм #${movies.length}: ${title} (${year})`);
            console.log(`   Аудио (первые 100 символов): ${(audioInfo || '').substring(0, 100)}`);
            console.log(`   Субтитры: ${subtitles || 'нет'}`);
        }
    }
    
    const output = { lastUpdated: new Date().toISOString(), total: movies.length, movies: movies };
    fs.writeFileSync('movies.json', JSON.stringify(output));
    console.log(`\n✅ Сохранено фильмов: ${movies.length}`);
    console.log(`   Пропущено строк: ${skipped}`);
}

buildMoviesCache().catch(console.error);
