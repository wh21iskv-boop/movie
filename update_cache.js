const fs = require('fs');
const fetch = require('node-fetch');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

async function searchKinopoisk(title, apiKey) {
    if (!title || title.length < 3) return null;
    
    try {
        const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
        const res = await fetch(url, { 
            headers: { 'X-API-KEY': apiKey } 
        });
        
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data.films && data.films[0]) {
            return {
                id: data.films[0].filmId,
                posterUrl: data.films[0].posterUrlPreview || data.films[0].posterUrl,
                rating: data.films[0].rating
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
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
        console.error(`❌ Не удалось загрузить таблицу: ${response.status}`);
        process.exit(1);
    }
    
    const csvText = await response.text();
    const lines = csvText.split('\n');
    console.log(`📊 Всего строк в таблице: ${lines.length}`);
    
    const movies = [];
    for (let i = 1; i < lines.length && i < 50; i++) { // сначала только 50 фильмов для теста
        const line = lines[i];
        if (!line.trim()) continue;
        
        const parts = line.split(',');
        const russianTitle = parts[2]?.replace(/^"|"$/g, '').trim();
        const originalTitle = parts[1]?.replace(/^"|"$/g, '').trim();
        const title = russianTitle || originalTitle;
        
        if (title && title !== '—' && title !== '-') {
            movies.push(title);
        }
    }
    
    console.log(`🎬 Будет обработано фильмов: ${movies.length}`);
    
    let newCount = 0;
    for (let i = 0; i < movies.length; i++) {
        const title = movies[i];
        
        if (cache.posters[title]) {
            console.log(`⏭️ [${i+1}/${movies.length}] Уже есть: ${title}`);
            continue;
        }
        
        console.log(`🔍 [${i+1}/${movies.length}] Ищу: ${title}`);
        const data = await searchKinopoisk(title, apiKey);
        
        if (data && data.posterUrl) {
            cache.posters[title] = data;
            console.log(`   ✅ Найден!`);
            newCount++;
        } else {
            console.log(`   ❌ Не найден`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync('posters.json', JSON.stringify(cache, null, 2));
    console.log(`\n✅ Готово! Добавлено ${newCount} новых постеров. Всего: ${Object.keys(cache.posters).length}`);
}

updateCache().catch(err => {
    console.error("❌ Критическая ошибка:", err);
    process.exit(1);
});
