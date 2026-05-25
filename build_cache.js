const fs = require('fs');
const axios = require('axios');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

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

function isValidMovieTitle(title) {
    if (!title) return false;
    if (title.length < 2) return false;
    
    const garbagePatterns = [
        /кбит/i, /kbps/i, /track_/i, /аудио/i, /стерео/i, 
        /mono/i, /h264/i, /ac3/i, /dts/i, /subrip/i,
        /mvo/i, /avo/i, /dvo/i, /оригинал/i, /prestige/i,
        /kultura/i, /фильм-экспорт/i, /\.avi$/i, /\.mkv$/i
    ];
    
    for (const pattern of garbagePatterns) {
        if (pattern.test(title.toLowerCase())) return false;
    }
    
    return true;
}

async function buildMoviesCache() {
    console.log("🔄 Построение кеша фильмов...");
    
    // Загружаем постеры
    let posters = {};
    try {
        const postersContent = fs.readFileSync('posters.json', 'utf8');
        const postersData = JSON.parse(postersContent);
        posters = postersData.posters || {};
        console.log(`📸 Загружено ${Object.keys(posters).length} постеров`);
    } catch(e) {
        console.log("📸 Постеры не найдены, будут добавлены позже");
    }
    
    // Загружаем таблицу
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу...`);
    
    const csvResponse = await axios.get(csvUrl);
    const lines = csvResponse.data.split('\n');
    
    const headers = parseCSVLine(lines[0]);
    console.log(`\n📌 ЗАГОЛОВКИ (найдено ${headers.length} колонок):`);
    headers.forEach((h, i) => {
        console.log(`   ${i}: "${h}"`);
    });
    
    // ТОЧНЫЕ названия колонок из вашей таблицы
    const findCol = (exactName) => {
        const index = headers.findIndex(h => h === exactName);
        if (index === -1) {
            console.log(`   ⚠️ Колонка не найдена: "${exactName}"`);
        }
        return index;
    };
    
    const colIndex = {
        year: findCol('Год выпуска'),
        originalTitle: findCol('Оригинальное название'),
        russianTitle: findCol('Русское название'),
        genre: findCol('Жанр'),
        description: findCol('Описание'),
        kinopoiskLink: findCol('Кинопоиск\nссылка на фильм'),
        ratingKP: findCol('Оценка Кинопоиск'),
        ratingIMDb: findCol('Оценка IMDb'),
        actors: findCol('Актерский состав'),
        premiere: findCol('Дата премьеры'),
        country: findCol('Страна'),
        director: findCol('Режиссер'),
        fileName: findCol('Имя файла'),
        duration: findCol('Длительность чч:мм:сс'),
        size: findCol('Размер (ГБ)'),
        resolution: findCol('Разрешение'),
        audio: findCol('Аудио информация'),
        videoCodec: findCol('Видеокодек'),
        bitrate: findCol('Битрейт (кбит/с)'),
        subtitles: findCol('Субтитры'),
        yandexFolder: findCol('Папка на Яндексе')
    };
    
    console.log(`\n📍 ОПРЕДЕЛЁННЫЕ ИНДЕКСЫ:`);
    console.log(colIndex);
    
    const movies = [];
    let skippedCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < 3) continue;
        
        const getVal = (idx) => idx !== -1 && idx < parts.length ? cleanValue(parts[idx]) : '';
        
        let title = getVal(colIndex.russianTitle) || getVal(colIndex.originalTitle);
        if (!title || !isValidMovieTitle(title)) {
            if (title) skippedCount++;
            continue;
        }
        
        const yearRaw = getVal(colIndex.year);
        const yearMatch = yearRaw.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : '';
        
        // Очищаем рейтинги
        let ratingKP = getVal(colIndex.ratingKP);
        if (ratingKP && (ratingKP.includes('kinopoisk') || ratingKP.includes('http'))) {
            const match = ratingKP.match(/(\d+[,.]?\d*)/);
            ratingKP = match ? match[1].replace(',', '.') : '';
        }
        
        let ratingIMDb = getVal(colIndex.ratingIMDb);
        if (ratingIMDb && ratingIMDb.includes('http')) {
            const match = ratingIMDb.match(/(\d+[,.]?\d*)/);
            ratingIMDb = match ? match[1].replace(',', '.') : '';
        }
        
        // Получаем постер
        const cacheKey = `${title}_${year || 'no-year'}`;
        const posterData = posters[cacheKey];
        
        const movie = {
            id: i,
            title: title,
            originalTitle: getVal(colIndex.originalTitle),
            year: year,
            genre: getVal(colIndex.genre),
            description: getVal(colIndex.description),
            kinopoiskLink: getVal(colIndex.kinopoiskLink),
            ratingKP: ratingKP,
            ratingIMDb: ratingIMDb,
            actors: getVal(colIndex.actors),
            country: getVal(colIndex.country),
            director: getVal(colIndex.director),
            duration: getVal(colIndex.duration),
            size: getVal(colIndex.size),
            resolution: getVal(colIndex.resolution),
            audioInfo: getVal(colIndex.audio),
            subtitles: getVal(colIndex.subtitles),
            fileName: getVal(colIndex.fileName),
            yandexFolder: getVal(colIndex.yandexFolder),
            posterUrl: posterData ? posterData.posterUrl : null
        };
        
        movies.push(movie);
    }
    
    const output = {
        lastUpdated: new Date().toISOString(),
        total: movies.length,
        movies: movies
    };
    
    fs.writeFileSync('movies.json', JSON.stringify(output, null, 2));
    console.log(`\n✅ РЕЗУЛЬТАТ:`);
    console.log(`   - Пропущено мусора: ${skippedCount}`);
    console.log(`   - Сохранено фильмов: ${movies.length}`);
    
    if (movies.length > 0) {
        console.log(`\n📋 ПРИМЕР ПЕРВОГО ФИЛЬМА:`);
        console.log(JSON.stringify(movies[0], null, 2));
    }
    
    // Статистика заполненности
    const stats = {
        hasCountry: movies.filter(m => m.country).length,
        hasActors: movies.filter(m => m.actors).length,
        hasDirector: movies.filter(m => m.director).length,
        hasAudio: movies.filter(m => m.audioInfo).length,
        hasSubtitles: movies.filter(m => m.subtitles).length,
        hasRating: movies.filter(m => m.ratingKP || m.ratingIMDb).length
    };
    
    console.log(`\n📊 СТАТИСТИКА ЗАПОЛНЕННОСТИ:`);
    console.log(`   - Страна: ${stats.hasCountry}/${movies.length}`);
    console.log(`   - Актеры: ${stats.hasActors}/${movies.length}`);
    console.log(`   - Режиссер: ${stats.hasDirector}/${movies.length}`);
    console.log(`   - Аудио: ${stats.hasAudio}/${movies.length}`);
    console.log(`   - Субтитры: ${stats.hasSubtitles}/${movies.length}`);
    console.log(`   - Рейтинг: ${stats.hasRating}/${movies.length}`);
}

buildMoviesCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
