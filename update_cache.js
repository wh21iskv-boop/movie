// update_cache.js
const fs = require('fs');
const fetch = require('node-fetch');

// --- НАСТРОЙКИ (измените под себя) ---
// ID из ссылки на вашу ОПУБЛИКОВАННУЮ таблицу:
// Пример: https://docs.google.com/spreadsheets/d/e/2PACX-1vT3Ima7.../pub?output=csv
const SPREADSHEET_ID = '2PACX-1vTJT3Ima7Qye4NmVPljMRk95erowQHWMDT9srmIFaQq-ErrUc3aAEyfhnE8rKmEhfjrc3xi96bqGcCJ';
// Ваш API-ключ будет передан через переменную окружения KINOPOISK_API_KEY
// ---

// Функция для поиска фильма по названию и году через Kinopoisk API
async function searchKinopoisk(title, year, apiKey) {
    if (!title) return null;
    
    const searchUrl = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
    
    try {
        const response = await fetch(searchUrl, {
            headers: { 'X-API-KEY': apiKey }
        });
        
        if (!response.ok) {
            console.warn(`API Error for "${title}": ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        if (data.films && data.films.length > 0) {
            let film = data.films[0];
            // Ищем точное совпадение по году, если он указан
            if (year) {
                const exactMatch = data.films.find(f => f.year === parseInt(year));
                if (exactMatch) film = exactMatch;
            }
            
            return {
                id: film.filmId,
                posterUrl: film.posterUrlPreview || film.posterUrl || null,
                nameRu: film.nameRu,
                nameEn: film.nameEn,
                rating: film.rating
            };
        }
        return null;
    } catch (error) {
        console.error(`Search error for "${title}":`, error.message);
        return null;
    }
}

// Основная функция обновления кеша
async function updateCache() {
    console.log("🔄 Начинаю обновление кеша постеров...");
    const apiKey = process.env.KINOPOISK_API_KEY;
    if (!apiKey) {
        console.error("❌ Ошибка: API-ключ KINOPOISK_API_KEY не найден в переменных окружения.");
        process.exit(1);
    }

    // 1. Загружаем текущий кеш из файла
    let cache = { lastUpdated: null, posters: {} };
    try {
        const cacheContent = fs.readFileSync('posters.json', 'utf8');
        cache = JSON.parse(cacheContent);
        console.log(`📦 Загружен текущий кеш. Содержит ${Object.keys(cache.posters).length} записей.`);
    } catch(e) {
        console.log("⚠️ Файл кеша не найден или поврежден. Будет создан новый.");
    }

    // 2. Загружаем данные из Google Sheets
    const csvUrl = `https://docs.google.com/spreadsheets/d/e/${SPREADSHEET_ID}/pub?output=csv`;
    console.log(`📥 Загружаю таблицу: ${csvUrl}`);
    const response = await fetch(csvUrl);
    if (!response.ok) {
        console.error(`❌ Не удалось загрузить таблицу: ${response.status}`);
        process.exit(1);
    }
    const csvText = await response.text();
    const rows = csvText.split('\n').map(row => row.split(','));
    if (rows.length < 2) {
        console.error("❌ Таблица пуста или имеет неверный формат.");
        process.exit(1);
    }

    const headers = rows[0].map(h => h.trim());
    // Находим индексы нужных колонок (адаптируйте под названия в вашей таблице)
    const titleIndex = headers.findIndex(h => h.includes('Русское название'));
    const originalIndex = headers.findIndex(h => h.includes('Оригинальное название'));
    const yearIndex = headers.findIndex(h => h.includes('Год выпуска'));

    console.log(`🔍 Найдено строк в таблице: ${rows.length - 1}`);

    // 3. Обрабатываем каждую строку таблицы
    let newCount = 0;
    for (let i = 1; i < rows.length; i++) {
        const cols = rows[i];
        const russianTitle = cols[titleIndex]?.trim();
        let title = russianTitle;
        let originalTitle = cols[originalIndex]?.trim();
        
        if (!title && originalTitle) title = originalTitle;
        if (!title || title === '—') continue;
        
        const yearMatch = cols[yearIndex]?.match(/\d{4}/);
        const year = yearMatch ? yearMatch[0] : null;
        
        const cacheKey = `${title}_${year || 'no-year'}`;
        
        // Если уже есть в кеше — пропускаем
        if (cache.posters[cacheKey]) {
            continue;
        }
        
        console.log(`🔍 Ищу: "${title}" (${year || 'год не указан'})`);
        const kinopoiskData = await searchKinopoisk(title, year, apiKey);
        
        if (kinopoiskData && kinopoiskData.posterUrl) {
            cache.posters[cacheKey] = kinopoiskData;
            console.log(`   ✅ Найден! Постер: ${kinopoiskData.posterUrl.substring(0, 60)}...`);
            newCount++;
        } else {
            console.log(`   ❌ Не найден.`);
        }
        
        // Задержка, чтобы не превысить лимит API (500/день)
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    // 4. Сохраняем обновленный кеш обратно в файл
    cache.lastUpdated = new Date().toISOString();
    fs.writeFileSync('posters.json', JSON.stringify(cache, null, 2));
    console.log(`\n✅ Готово! Добавлено ${newCount} новых постеров. Всего записей: ${Object.keys(cache.posters).length}.`);
    console.log(`🕒 Последнее обновление: ${cache.lastUpdated}`);
}

// Запускаем скрипт
updateCache().catch(err => {
    console.error("❌ Критическая ошибка:", err);
    process.exit(1);
});
