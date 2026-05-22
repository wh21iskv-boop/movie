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
        console.log("📸 Постеры не найдены");
    }
    
    // Загружаем таблицу
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу...`);
    
    const csvResponse = await axios.get(csvUrl);
    const lines = csvResponse.data.split('\n');
    
    const headers = parseCSVLine(lines[0]);
    const idx = {
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
        duration: headers.findIndex(h => h && (h.includes('Длительность чел/мес') || h.includes('Длительность'))),
        resolution: headers.findIndex(h => h && h.includes('Разрешение'))
    };
    
    console.log(`📌 Индексы:`, idx);
    
    const movies = [];
    for (let i = 1; i < lines.length; i++) {
        const parts = parseCSVLine(lines[i]);
        if (parts.length === 0) continue;
        
        const getVal = (i) => i !== -1 && i < parts.length ? parts[i] : '';
        
        let russianTitle = getVal(idx.russianTitle);
        let originalTitle = getVal(idx.originalTitle);
        
        if (!russianTitle && originalTitle) {
            russianTitle = originalTitle;
            originalTitle = '';
        }
        
        if (!russianTitle || russianTitle === '—' || russianTitle === '-') continue;
        
        // Очищаем рейтинги
        let ratingKP = getVal(idx.ratingKP);
        if (ratingKP && (ratingKP.includes('kinopoisk') || ratingKP.includes('http'))) {
            const match = ratingKP.match(/(\d+[,.]?\d*)/);
            ratingKP = match ? match[1].replace(',', '.') : '';
        }
        
        let ratingIMDb = getVal(idx.ratingIMDb);
        if (ratingIMDb && ratingIMDb.includes('http')) {
            const match = ratingIMDb.match(/(\d+[,.]?\d*)/);
            ratingIMDb = match ? match[1].replace(',', '.') : '';
        }
        
        // Получаем постер из кеша
        const year = getVal(idx.year);
        const yearMatch = year.match(/\d{4}/);
        const cacheKey = `${russianTitle}_${yearMatch ? yearMatch[0] : 'no-year'}`;
        const posterData = posters[cacheKey];
        
        movies.push({
            id: i,
            title: russianTitle,
            originalTitle: originalTitle,
            year: yearMatch ? yearMatch[0] : '',
            genre: getVal(idx.genre),
            description: getVal(idx.description),
            kinopoiskLink: getVal(idx.kinopoiskLink),
            ratingKP: ratingKP,
            ratingIMDb: ratingIMDb,
            actors: getVal(idx.actors),
            country: getVal(idx.country),
            director: getVal(idx.director),
            duration: getVal(idx.duration),
            resolution: getVal(idx.resolution),
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
    console.log(`✅ Готово! Сохранено ${movies.length} фильмов в movies.json`);
    console.log(`🕒 Последнее обновление: ${output.lastUpdated}`);
}

buildMoviesCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
