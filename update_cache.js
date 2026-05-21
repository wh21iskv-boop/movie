const fs = require('fs');
const axios = require('axios');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

async function searchKinopoisk(title, apiKey) {
    if (!title || title.length < 3) return null;
    
    try {
        const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': apiKey }
        });
        
        if (response.data && response.data.films && response.data.films[0]) {
            return {
                id: response.data.films[0].filmId,
                posterUrl: response.data.films[0].posterUrlPreview || response.data.films[0].posterUrl,
                rating: response.data.films[0].rating
            };
        }
        return null;
    } catch(e) {
        console.log(`   Ошибка: ${e.message}`);
        return null;
    }
}

async function updateCache() {
    console.log("🔄 Начинаю обновление кеша постеров...");
    const apiKey = process.env.KINOPOISK_API_KEY;
    if (!apiKey) {
        console.error("❌ Ошибка: API-ключ не найден!");
        process.exit(1);
    }

    let cache = { lastUpdated: null, posters: {} };
    try {
        const cacheContent = fs.readFileSync('posters.json', 'utf8');
        cache = JSON.parse(cacheContent);
        console.log(`📦 Загружен кеш. Содержит ${Object.keys(cache.posters).length} записей.`);
    } catch(e) {
        console.log("📦 Создаю новый кеш");
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу: ${csvUrl}`);
    
    const csvResponse = await axios.get(csvUrl);
    const csvText = csvResponse.data;
    const lines = csvText.split('\n');
    console.log(`📊 Всего строк в таблице: ${lines.length}`);
    
    // Парсим все фильмы
    const movies = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const parts = [];
        let current = '';
        let inQuotes = false;
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                parts.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        parts.push(current);
        
        const russianTitle = parts[2]?.replace(/^"|"$/g, '').trim();
        const originalTitle = parts[1]?.replace(/^"|"$/g, '').trim();
        const title = russianTitle || originalTitle;
        
        if (title && title !== '—' && title !== '-') {
            movies.push(title);
        }
    }
    
    console.log(`🎬 Всего фильмов для обработки: ${movies.length}`);
    
    let newCount = 0;
    let skippedCount = 0;
    let dailyLimit = 0;
    
    for (let i = 0; i < movies.length; i++) {
        const title = movies[i];
        
        // Проверяем, есть ли уже в кеше
        let found = false;
        for (const key in cache.posters) {
            if (key === title) {
                found = true;
                break;
            }
        }
        
        if (found) {
            skippedCount++;
            continue;
        }
        
        // Ограничиваем 500 запросами в сутки
        if (dailyLimit >= 500) {
            console.log(`\n⚠️ Достигнут лимит 500 запросов в сутки. Остановлено на ${i} фильме.`);
            console.log(`Завтра скрипт продолжит с того же места.`);
            break;
        }
        
        console.log(`🔍 [${i+1}/${movies.length}] Ищу: ${title}`);
        const data = await searchKinopoisk(title, apiKey);
        dailyLimit++;
        
        if (data && data.posterUrl) {
            cache.posters[title] = data;
            console.log(`   ✅ Найден! (${dailyLimit}/500 сегодня)`);
            newCount++;
        } else {
            console.log(`   ❌ Не найден (${dailyLimit}/500 сегодня)`);
        }
        
        // Ждём между запросами
        await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync('posters.json', JSON.stringify(cache, null, 2));
    console.log(`\n✅ Готово!`);
    console.log(`   - Пропущено (уже в кеше): ${skippedCount}`);
    console.log(`   - Добавлено новых: ${newCount}`);
    console.log(`   - Всего в кеше: ${Object.keys(cache.posters).length}`);
}

updateCache().catch(err => {
    console.error("❌ Критическая ошибка:", err);
    process.exit(1);
});
