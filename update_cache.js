// update_cache.js
const fs = require('fs');
const fetch = require('node-fetch');

const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';

async function searchKinopoisk(title, year, apiKey) {
    if (!title || title.length < 2) return null;
    
    try {
        const searchUrl = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
        const response = await fetch(searchUrl, { headers: { 'X-API-KEY': apiKey } });
        
        if (!response.ok) return null;
        
        const data = await response.json();
        
        if (data.films && data.films.length > 0) {
            let film = data.films[0];
            if (year) {
                const exactMatch = data.films.find(f => f.year === parseInt(year));
                if (exactMatch) film = exactMatch;
            }
            return {
                id: film.filmId,
                posterUrl: film.posterUrlPreview || film.posterUrl || null,
                rating: film.rating
            };
        }
        return null;
    } catch (error) {
        console.log(`   ⚠️ Ошибка: ${error.message}`);
        return null;
    }
}

async function updateCache() {
    console.log("🔄 Начинаю обновление кеша постеров...");
    const apiKey = process.env.KINOPOISK_API_KEY;
    if (!apiKey) {
        console.error("❌ API-ключ не найден!");
        process.exit(1);
    }

    let cache = { lastUpdated: null, posters: {} };
    try {
        const cacheContent = fs.readFileSync('posters.json', 'utf8');
        cache = JSON.parse(cacheContent);
        console.log(`📦 В кеше уже ${Object.keys(cache.posters).length} постеров`);
    } catch(e) {
        console.log("📦 Создаю новый кеш");
    }

    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу...`);
    
    const response = await fetch(csvUrl);
    if (!response.ok) {
        console.error(`❌ Ошибка загрузки: ${response.status}`);
        process.exit(1);
    }
    
    const csvText = await response.text();
    const lines = csvText.split('\n');
    console.log(`📊 Всего строк: ${lines.length}`);
    
    if (lines.length < 2) {
        console.error("❌ Таблица пуста");
        process.exit(1);
    }
    
    // Парсим CSV правильно (с учётом кавычек)
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }
    
    const headers = parseCSVLine(lines[0]);
    console.log(`📌 Заголовки колонок:`);
    headers.forEach((h, i) => console.log(`   ${i}: "${h}"`));
    
    const titleIndex = headers.findIndex(h => h && (h.includes('Русское название') || h.includes('Название русское')));
    const originalIndex = headers.findIndex(h => h && (h.includes('Оригинальное название') || h.includes('Оригинал')));
    const yearIndex = headers.findIndex(h => h && (h.includes('Год выпуска') || h.includes('Год')));
    
    console.log(`📍 Индексы: Название=${titleIndex}, Оригинал=${originalIndex}, Год=${yearIndex}`);
    
    if (titleIndex === -1 && originalIndex === -1) {
        console.error("❌ Не найдена колонка с названием фильма!");
        process.exit(1);
    }
    
    let newCount = 0;
    let processed = 0;
    
    for (let i = 1; i < lines.length && i < 50; i++) { // Ограничим 50 для теста
        const line = lines[i].trim();
        if (!line) continue;
        
        const cols = parseCSVLine(line);
        let title = titleIndex !== -1 && cols[titleIndex] ? cols[titleIndex].replace(/^"|"$/g, '').trim() : '';
        
        if (!title && originalIndex !== -1 && cols[originalIndex]) {
            title = cols[originalIndex].replace(/^"|"$/g, '').trim();
        }
        
        if (!title || title === '—' || title === '-') continue;
        
        let year = '';
        if (yearIndex !== -1 && cols[yearIndex]) {
            const yearMatch = cols[yearIndex].match(/\d{4}/);
            if (yearMatch) year = yearMatch[0];
        }
        
        processed++;
        const cacheKey = `${title}_${year || 'no-year'}`;
        
        if (cache.posters[cacheKey]) {
            continue;
        }
        
        console.log(`🔍 [${processed}] "${title}" (${year || '?'})`);
        const data = await searchKinopoisk(title, year, apiKey);
        
        if (data && data.posterUrl) {
            cache.posters[cacheKey] = data;
            console.log(`   ✅ Постер найден!`);
            newCount++;
        } else {
            console.log(`   ❌ Постер не найден`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync('posters.json', JSON.stringify(cache, null, 2));
    console.log(`\n✅ Готово! Обработано ${processed}, добавлено ${newCount}, всего в кеше ${Object.keys(cache.posters).length}`);
}

updateCache();
