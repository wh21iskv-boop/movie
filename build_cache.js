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

// Проверка, является ли строка названием фильма (не мусором)
function isValidMovieTitle(title) {
    if (!title) return false;
    if (title.length < 2) return false;
    if (title === '—' || title === '-') return false;
    
    // Мусорные паттерны
    const garbagePatterns = [
        /кбит\/с/i, /TRACK_/i, /kbps/i, /H264/i, /AC3/i, 
        /subrip/i, /Аудио/i, /DTS/i, /AAC/i, /стерео/i,
        /MVO/i, /AVO/i, /DVO/i, /оригинал/i, /Original/i,
        /\.avi$/i, /\.mkv$/i, /\.mp4$/i, /Prestige/i,
        /Kultura/i, /Фильм-экспорт/i, /ТВ-/i, /Film/i
    ];
    
    for (const pattern of garbagePatterns) {
        if (pattern.test(title)) return false;
    }
    
    return true;
}

async function buildMoviesCache() {
    console.log("🔄 Построение кеша фильмов...");
    
    // Загружаем постеры из кеша
    let posters = {};
    try {
        const postersContent = fs.readFileSync('posters.json', 'utf8');
        const postersData = JSON.parse(postersContent);
        posters = postersData.posters || {};
        console.log(`📸 Загружено ${Object.keys(posters).length} постеров`);
    } catch(e) {
        console.log("📸 Постеры не найдены, будут созданы позже");
    }
    
    // Загружаем таблицу
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу: ${csvUrl}`);
    
    const csvResponse = await axios.get(csvUrl);
    const lines = csvResponse.data.split('\n');
    console.log(`📊 Всего строк: ${lines.length}`);
    
    const headers = parseCSVLine(lines[0]);
    console.log(`📌 Заголовки колонок:`);
    headers.forEach((h, i) => {
        if (h && h.length > 0) console.log(`   ${i}: "${h}"`);
    });
    
    // Находим индексы всех нужных колонок (по вашим названиям)
    const colIndex = {
        year: headers.findIndex(h => h && (h.includes('Год выпуска') || h.includes('Год'))),
        originalTitle: headers.findIndex(h => h && (h.includes('Оригинальное название') || h.includes('Оригинал'))),
        russianTitle: headers.findIndex(h => h && (h.includes('Русское название') || h.includes('Название русское'))),
        genre: headers.findIndex(h => h && h.includes('Жанр')),
        description: headers.findIndex(h => h && (h.includes('Описание фильма') || h.includes('Описание'))),
        kinopoiskLink: headers.findIndex(h => h && (h.includes('Киноискусская') || h.includes('ссылка'))),
        ratingKP: headers.findIndex(h => h && (h.includes('Оценка Кинопоиска') || h.includes('Оценка Кинопоиск'))),
        ratingIMDb: headers.findIndex(h => h && (h.includes('Оценка ИМДБ') || h.includes('IMDb'))),
        actors: headers.findIndex(h => h && (h.includes('Актерский состав') || h.includes('Актеры'))),
        country: headers.findIndex(h => h && h.includes('Страна')),
        director: headers.findIndex(h => h && (h.includes('Режиссер') || h.includes('Режиссёр'))),
        duration: headers.findIndex(h => h && (h.includes('Длительность') || h.includes('Длительность чел/мес'))),
        size: headers.findIndex(h => h && h.includes('Размер (ГБ)')),
        resolution: headers.findIndex(h => h && h.includes('Разрешение')),
        audio: headers.findIndex(h => h && (h.includes('Аудио информация') || h.includes('Аудио'))),
        subtitles: headers.findIndex(h => h && (h.includes('Субтитр') || h.includes('Субтитры'))),
        fileName: headers.findIndex(h => h && (h.includes('Имя файла') || h.includes('Инв. файла'))),
        yandexFolder: headers.findIndex(h => h && (h.includes('Папка на Яндекс') || h.includes('Яндекс')))
    };
    
    console.log(`📍 Найденные индексы:`, colIndex);
    
    const movies = [];
    let skippedCount = 0;
    
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length === 0) continue;
        
        const getVal = (idx) => idx !== -1 && idx < parts.length ? parts[idx] : '';
        
        const russianTitle = getVal(colIndex.russianTitle);
        const originalTitle = getVal(colIndex.originalTitle);
        
        // Проверяем, что это реальный фильм
        const title = russianTitle || originalTitle;
        if (!isValidMovieTitle(title)) {
            skippedCount++;
            continue;
        }
        
        // Получаем год
        let year = getVal(colIndex.year);
        const yearMatch = year.match(/\d{4}/);
        year = yearMatch ? yearMatch[0] : '';
        
        // Очищаем рейтинги
        let ratingKP = getVal(colIndex.ratingKP);
        if (ratingKP && (ratingKP.includes('kinopoisk') || ratingKP.includes('http'))) {
            const match = ratingKP.match(/(\d+[,.]?\d*)/);
            ratingKP = match ? match[1].replace(',', '.') : '';
        }
        if (ratingKP === '—' || ratingKP === '-') ratingKP = '';
        
        let ratingIMDb = getVal(colIndex.ratingIMDb);
        if (ratingIMDb && ratingIMDb.includes('http')) {
            const match = ratingIMDb.match(/(\d+[,.]?\d*)/);
            ratingIMDb = match ? match[1].replace(',', '.') : '';
        }
        if (ratingIMDb === '—' || ratingIMDb === '-') ratingIMDb = '';
        
        // Получаем аудио (сохраняем как есть, без разбивки)
        let audioInfo = getVal(colIndex.audio);
        if (audioInfo === '—' || audioInfo === '-') audioInfo = '';
        
        // Получаем субтитры
        let subtitles = getVal(colIndex.subtitles);
        if (subtitles === '—' || subtitles === '-') subtitles = '';
        
        // Получаем постер из кеша
        const cacheKey = `${title}_${year || 'no-year'}`;
        const posterData = posters[cacheKey];
        
        movies.push({
            id: i,
            title: title,
            originalTitle: originalTitle || '',
            year: year,
            genre: getVal(colIndex.genre) || '',
            description: getVal(colIndex.description) || '',
            kinopoiskLink: getVal(colIndex.kinopoiskLink) || '',
            ratingKP: ratingKP,
            ratingIMDb: ratingIMDb,
            actors: getVal(colIndex.actors) || '',
            country: getVal(colIndex.country) || '',
            director: getVal(colIndex.director) || '',
            duration: getVal(colIndex.duration) || '',
            size: getVal(colIndex.size) || '',
            resolution: getVal(colIndex.resolution) || '',
            audioInfo: audioInfo,
            subtitles: subtitles,
            fileName: getVal(colIndex.fileName) || '',
            yandexFolder: getVal(colIndex.yandexFolder) || '',
            posterUrl: posterData ? posterData.posterUrl : null
        });
    }
    
    // Сохраняем в movies.json
    const output = {
        lastUpdated: new Date().toISOString(),
        total: movies.length,
        movies: movies
    };
    
    fs.writeFileSync('movies.json', JSON.stringify(output, null, 2));
    console.log(`\n✅ Результат:`);
    console.log(`   - Пропущено мусорных строк: ${skippedCount}`);
    console.log(`   - Сохранено фильмов: ${movies.length}`);
    console.log(`   - Файл: movies.json`);
    console.log(`🕒 Последнее обновление: ${output.lastUpdated}`);
}

buildMoviesCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
