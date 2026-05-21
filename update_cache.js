const fs = require('fs');
const fetch = require('node-fetch');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

async function searchKinopoisk(title, apiKey) {
    if (!title || title.length < 3) return null;
    
    try {
        const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
        const res = await fetch(url, { headers: { 'X-API-KEY': apiKey } });
        
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
        return null;
    }
}

async function updateCache() {
    console.log("🔄 Старт...");
    const apiKey = process.env.KINOPOISK_API_KEY;
    if (!apiKey) {
        console.error("❌ Нет API ключа");
        process.exit(1);
    }

    let cache = { posters: {} };
    try {
        const existing = fs.readFileSync('posters.json', 'utf8');
        cache = JSON.parse(existing);
        console.log(`📦 В кеше: ${Object.keys(cache.posters).length}`);
    } catch(e) {
        console.log("📦 Новый кеш");
    }

    // Загружаем таблицу
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    const response = await fetch(csvUrl);
    const csvText = await response.text();
    const lines = csvText.split('\n');
    
    console.log(`📊 Строк в таблице: ${lines.length}`);
    
    // Простой парсинг CSV
    const titles = [];
    for (let i = 1; i < lines.length && i < 100; i++) { // для теста первые 100
        const line = lines[i];
        if (!line.trim()) continue;
        
        // Берём первые 3 колонки: Год, Оригинал, Русское
        const parts = line.split(',');
        const russianTitle = parts[2]?.replace(/^"|"$/g, '').trim();
        const originalTitle = parts[1]?.replace(/^"|"$/g, '').trim();
        const title = russianTitle || originalTitle;
        
        if (title && title !== '—' && title !== '-') {
            titles.push(title);
        }
    }
    
    console.log(`🎬 Названий для поиска: ${titles.length}`);
    
    let newCount = 0;
    for (let i = 0; i < titles.length; i++) {
        const title = titles[i];
        
        if (cache.posters[title]) {
            console.log(`⏭️ Пропускаю: ${title}`);
            continue;
        }
        
        console.log(`🔍 [${i+1}/${titles.length}] ${title}`);
        const data = await searchKinopoisk(title, apiKey);
        
        if (data && data.posterUrl) {
            cache.posters[title] = data;
            console.log(`   ✅ Найден!`);
            newCount++;
        } else {
            console.log(`   ❌ Не найден`);
        }
        
        await new Promise(r => setTimeout(r, 300));
    }
    
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync('posters.json', JSON.stringify(cache, null, 2));
    console.log(`\n✅ Добавлено: ${newCount}, всего: ${Object.keys(cache.posters).length}`);
}

updateCache().catch(err => {
    console.error("❌ Ошибка:", err);
    process.exit(1);
});
