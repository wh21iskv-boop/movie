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

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) { result.push(current); current = ''; }
        else current += char;
    }
    result.push(current);
    return result.map(f => f.replace(/^"|"$/g, '').trim());
}

function cleanValue(v) { if (!v || v === '—' || v === '-') return ''; return v; }

// Проверка, является ли строка реальным фильмом
function isRealMovie(title, year, genre, actors, director) {
    if (!title || title.length < 2) return false;
    
    const titleLower = title.toLowerCase();
    
    // Точные мусорные паттерны
    const garbage = [
        /^\d+\s*kb\/?s/i, /^\d+\.?\d*\s*khz/i, /^\d+\s*channels?/i,
        /аудио\s*#?\d*/i, /ac3|dts|aac|mp3/i, /stereo|mono/i,
        /track_/i, /h\.?264|xvid|divx/i, /^\d[\d\s\.:]+$/, /^\d+$/
    ];
    for (const g of garbage) if (g.test(titleLower)) return false;
    
    // Если есть жанр, год, актёры или режиссёр — это фильм
    if (genre && genre.length > 2 && genre !== '—') return true;
    if (year && year.match(/\d{4}/)) return true;
    if (actors && actors.length > 5 && actors !== '—') return true;
    if (director && director.length > 3 && director !== '—') return true;
    if (titleLower.includes('фильм') && title.length > 4) return true;
    
    return false;
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
    const lines = response.data.split('\n');
    console.log(`📊 Всего строк: ${lines.length}`);
    
    const movies = [];
    let skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < 3) { skipped++; continue; }
        
        const getVal = (idx) => idx < parts.length ? cleanValue(parts[idx]) : '';
        
        const title = getVal(COL.russianTitle) || getVal(COL.originalTitle);
        const yearRaw = getVal(COL.year);
        const year = yearRaw.match(/\d{4}/)?.[0] || '';
        const genre = getVal(COL.genre);
        const actors = getVal(COL.actors);
        const director = getVal(COL.director);
        
        if (!isRealMovie(title, year, genre, actors, director)) {
            skipped++;
            continue;
        }
        
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
            genre: genre,
            description: getVal(COL.description),
            kinopoiskLink: getVal(COL.kinopoiskLink),
            ratingKP: ratingKP,
            ratingIMDb: ratingIMDb,
            actors: actors,
            country: getVal(COL.country),
            director: director,
            duration: getVal(COL.duration),
            size: getVal(COL.size),
            resolution: getVal(COL.resolution),
            audioInfo: getVal(COL.audio),
            subtitles: getVal(COL.subtitles),
            fileName: getVal(COL.fileName),
            yandexFolder: getVal(COL.yandexFolder),
            posterUrl: posterData ? posterData.posterUrl : null
        });
    }
    
    const output = { lastUpdated: new Date().toISOString(), total: movies.length, movies: movies };
    fs.writeFileSync('movies.json', JSON.stringify(output));
    console.log(`\n✅ Сохранено фильмов: ${movies.length}`);
    console.log(`   Пропущено мусора: ${skipped}`);
}

buildMoviesCache().catch(console.error);
