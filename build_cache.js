const fs = require('fs');
const axios = require('axios');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

// ===== ТОЧНЫЕ ИНДЕКСЫ КОЛОНОК ИЗ ВАШЕЙ ТАБЛИЦЫ =====
const COL = {
    year: 0,              // Год выпуска
    originalTitle: 1,     // Оригинальное название
    russianTitle: 2,      // Русское название
    genre: 3,             // Жанр
    description: 4,       // Описание
    kinoriumLink: 5,      // Кинориум ссылка на фильм
    kinopoiskLink: 6,     // Кинопоиск ссылка на фильм
    ratingKP: 7,          // Оценка Кинопоиск
    ratingIMDb: 8,        // Оценка IMDb
    actors: 9,            // Актерский состав
    premiere: 10,         // Дата премьеры
    country: 11,          // Страна
    director: 12,         // Режиссер
    fileName: 13,         // Имя файла
    duration: 14,         // Длительность чч:мм:сс
    size: 15,             // Размер (ГБ)
    resolution: 16,       // Разрешение
    audio: 17,            // Аудио информация
    videoCodec: 18,       // Видеокодек
    bitrate: 19,          // Битрейт (кбит/с)
    subtitles: 20,        // Субтитры
    yandexFolder: 21      // Папка на Яндексе
};
// =================================================

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
    console.log(`📊 Всего строк: ${lines.length}`);
    
    // Показываем первую строку с заголовками для проверки
    const headers = parseCSVLine(lines[0]);
    console.log(`\n📌 ПРОВЕРКА СООТВЕТСТВИЯ ИНДЕКСОВ:`);
    for (let i = 0; i < Math.min(headers.length, 25); i++) {
        const match = Object.entries(COL).find(([key, idx]) => idx === i);
        const marker = match ? ` ✅ ${match[0]}` : '';
        console.log(`   ${i}: "${headers[i]}"${marker}`);
    }
    
    const movies = [];
    let skipped = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length < 3) {
            skipped++;
            continue;
        }
        
        const getVal = (idx) => idx < parts.length ? cleanValue(parts[idx]) : '';
        
        let title = getVal(COL.russianTitle) || getVal(COL.originalTitle);
        if (!title) {
            skipped++;
            continue;
        }
        
        // Пропускаем мусор
        if (title.match(/кбит|kbps|track|аудио|стерео|mono|h264|ac3|dts/i)) {
            skipped++;
            continue;
        }
        
        // Получаем год
        const yearRaw = getVal(COL.year);
        const yearMatch = yearRaw.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : '';
        
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
        
        // Получаем постер из кеша
        const cacheKey = `${title}_${year || 'no-year'}`;
        const posterData = posters[cacheKey];
        
        const movie = {
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
            audioInfo: getVal(COL.audio),
            subtitles: getVal(COL.subtitles),
            fileName: getVal(COL.fileName),
            yandexFolder: getVal(COL.yandexFolder),
            posterUrl: posterData ? posterData.posterUrl : null
        };
        
        movies.push(movie);
        
        // Вывод первых 3 фильмов для проверки
        if (movies.length <= 3) {
            console.log(`\n📋 ФИЛЬМ #${movies.length}: "${title}"`);
            console.log(`   Оригинал: "${movie.originalTitle}"`);
            console.log(`   Год: "${movie.year}"`);
            console.log(`   Жанр: "${movie.genre}"`);
            console.log(`   Страна: "${movie.country}"`);
            console.log(`   Режиссер: "${movie.director}"`);
            console.log(`   Актеры: "${movie.actors?.substring(0, 100)}..."`);
            console.log(`   Длительность: "${movie.duration}"`);
            console.log(`   Разрешение: "${movie.resolution}"`);
            console.log(`   Аудио: "${movie.audioInfo?.substring(0, 100)}..."`);
            console.log(`   Субтитры: "${movie.subtitles}"`);
            console.log(`   Ссылка КП: "${movie.kinopoiskLink}"`);
            console.log(`   Рейтинг КП: "${movie.ratingKP}"`);
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
    
    // Статистика заполненности
    const stats = {
        hasOriginal: movies.filter(m => m.originalTitle).length,
        hasActors: movies.filter(m => m.actors).length,
        hasCountry: movies.filter(m => m.country).length,
        hasDirector: movies.filter(m => m.director).length,
        hasAudio: movies.filter(m => m.audioInfo).length,
        hasSubtitles: movies.filter(m => m.subtitles).length,
        hasRating: movies.filter(m => m.ratingKP || m.ratingIMDb).length,
        hasKinopoiskLink: movies.filter(m => m.kinopoiskLink).length,
        hasPoster: movies.filter(m => m.posterUrl).length
    };
    
    console.log(`\n📊 СТАТИСТИКА ЗАПОЛНЕННОСТИ ПОЛЕЙ:`);
    console.log(`   - Оригинальное название: ${stats.hasOriginal}/${movies.length}`);
    console.log(`   - Актеры: ${stats.hasActors}/${movies.length}`);
    console.log(`   - Страна: ${stats.hasCountry}/${movies.length}`);
    console.log(`   - Режиссер: ${stats.hasDirector}/${movies.length}`);
    console.log(`   - Аудио: ${stats.hasAudio}/${movies.length}`);
    console.log(`   - Субтитры: ${stats.hasSubtitles}/${movies.length}`);
    console.log(`   - Рейтинг: ${stats.hasRating}/${movies.length}`);
    console.log(`   - Ссылка Кинопоиск: ${stats.hasKinopoiskLink}/${movies.length}`);
    console.log(`   - Постеры (из кеша): ${stats.hasPoster}/${movies.length}`);
}

buildMoviesCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
