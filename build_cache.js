const fs = require('fs');
const axios = require('axios');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

// ===== ТОЧНЫЕ ИНДЕКСЫ КОЛОНОК =====
const COL = {
    year: 0, originalTitle: 1, russianTitle: 2, genre: 3, description: 4,
    kinoriumLink: 5, kinopoiskLink: 6, ratingKP: 7, ratingIMDb: 8,
    actors: 9, premiere: 10, country: 11, director: 12, fileName: 13,
    duration: 14, size: 15, resolution: 16, audio: 17, videoCodec: 18,
    bitrate: 19, subtitles: 20, yandexFolder: 21
};
// =================================

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result.map(field => field.replace(/^"|"$/g, '').trim());
}

function cleanValue(value) {
    if (!value) return '';
    if (value === '—' || value === '-' || value === 'null') return '';
    return value;
}

// Проверка, является ли строка реальным фильмом
function isValidMovie(title, genre, year, audio) {
    if (!title) return false;
    if (title.length < 2) return false;
    
    const titleLower = title.toLowerCase();
    
    // Мусорные паттерны
    const garbagePatterns = [
        /^\d+\s*kb\/?s/, /^\d+\.?\d*\s*khz/, /^\d+\s*channels?/,
        /^аудио\s*#?\d*/i, /ac3|dts|aac|mp3/, /stereo|mono/,
        /track_/i, /h\.?264|xvid|divx/i, /^\d[\d\s\.:]+$/
    ];
    
    for (const pattern of garbagePatterns) {
        if (pattern.test(titleLower)) return false;
    }
    
    // Если есть жанр и год, это точно фильм
    if (genre && genre !== '—' && genre.length > 2) return true;
    if (year && year.match(/\d{4}/)) return true;
    
    // Если есть актёры или режиссёр, это фильм
    return false;
}

async function buildMoviesCache() {
    console.log("🔄 Построение кеша фильмов...");
    
    let posters = {};
    try {
        const postersContent = fs.readFileSync('posters.json', 'utf8');
        const postersData = JSON.parse(postersContent);
        posters = postersData.posters || {};
        console.log(`📸 Загружено ${Object.keys(posters).length} постеров`);
    } catch(e) {
        console.log("📸 Постеры не найдены");
    }
    
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу...`);
    
    const csvResponse = await axios.get(csvUrl);
    const lines = csvResponse.data.split('\n');
    console.log(`📊 Всего строк: ${lines.length}`);
    
    const movies = [];
    let skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < 3) {
            skipped++;
            continue;
        }
        
        const getVal = (idx) => idx < parts.length ? cleanValue(parts[idx]) : '';
        
        const title = getVal(COL.russianTitle) || getVal(COL.originalTitle);
        const genre = getVal(COL.genre);
        const yearRaw = getVal(COL.year);
        const yearMatch = yearRaw.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : '';
        const audio = getVal(COL.audio);
        
        // Умная фильтрация
        if (!isValidMovie(title, genre, year, audio)) {
            skipped++;
            continue;
        }
        
        // Очищаем рейтинги
        let ratingKP = getVal(COL.ratingKP);
        if (ratingKP && !ratingKP.match(/^\d+[,.]?\d*$/)) {
            const match = ratingKP.match(/(\d+[,.]?\d*)/);
            ratingKP = match ? match[1].replace(',', '.') : '';
        }
        
        let ratingIMDb = getVal(COL.ratingIMDb);
        if (ratingIMDb && !ratingIMDb.match(/^\d+[,.]?\d*$/)) {
            const match = ratingIMDb.match(/(\d+[,.]?\d*)/);
            ratingIMDb = match ? match[1].replace(',', '.') : '';
        }
        
        const cacheKey = `${title}_${year || 'no-year'}`;
        const posterData = posters[cacheKey];
        
        const movie = {
            id: i,
            title: title,
            originalTitle: getVal(COL.originalTitle),
            year: year,
            genre: genre,
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
            audioInfo: audio,
            subtitles: getVal(COL.subtitles),
            fileName: getVal(COL.fileName),
            yandexFolder: getVal(COL.yandexFolder),
            posterUrl: posterData ? posterData.posterUrl : null
        };
        
        movies.push(movie);
        
        // Вывод первых 3 фильмов для проверки
        if (movies.length <= 3) {
            console.log(`\n📋 ФИЛЬМ #${movies.length}: "${title}"`);
            console.log(`   Год: "${year}", Жанр: "${genre}"`);
            console.log(`   Страна: "${movie.country}", Режиссер: "${movie.director}"`);
        }
    }
    
    const output = {
        lastUpdated: new Date().toISOString(),
        total: movies.length,
        movies: movies
    };
    
    fs.writeFileSync('movies.json', JSON.stringify(output, null, 2));
    console.log(`\n✅ РЕЗУЛЬТАТ:`);
    console.log(`   - Пропущено строк: ${skipped}`);
    console.log(`   - Сохранено фильмов: ${movies.length}`);
    
    const stats = {
        hasActors: movies.filter(m => m.actors).length,
        hasCountry: movies.filter(m => m.country).length,
        hasDirector: movies.filter(m => m.director).length,
        hasAudio: movies.filter(m => m.audioInfo).length,
        hasPoster: movies.filter(m => m.posterUrl).length
    };
    
    console.log(`\n📊 СТАТИСТИКА:`);
    console.log(`   - Актеры: ${stats.hasActors}/${movies.length}`);
    console.log(`   - Страна: ${stats.hasCountry}/${movies.length}`);
    console.log(`   - Режиссер: ${stats.hasDirector}/${movies.length}`);
    console.log(`   - Аудио: ${stats.hasAudio}/${movies.length}`);
    console.log(`   - Постеры: ${stats.hasPoster}/${movies.length}`);
}

buildMoviesCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
