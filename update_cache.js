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
    
    // Очищаем от кавычек
    return result.map(field => field.replace(/^"|"$/g, '').trim());
}

async function searchKinopoisk(title, apiKey) {
    if (!title || title.length < 3) return null;
    // Пропускаем явно технические строки
    if (title.match(/\d+\s*кбит\/с/i)) return null;
    if (title.match(/TRACK_\d+/i)) return null;
    if (title.match(/H264/i)) return null;
    if (title.includes('kbps') || title.includes('кбит')) return null;
    
    try {
        const url = `https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=${encodeURIComponent(title)}`;
        const response = await axios.get(url, {
            headers: { 'X-API-KEY': apiKey }
        });
        
        if (response.data && response.data.films && response.data.films[0]) {
            const film = response.data.films[0];
            // Проверяем, что название похоже на фильм (не слишком короткое и не техническое)
            if (film.nameRu && film.nameRu.length > 2 && !film.nameRu.match(/^\d+$/)) {
                return {
                    id: film.filmId,
                    posterUrl: film.posterUrlPreview || film.posterUrl,
                    rating: film.rating
                };
            }
        }
        return null;
    } catch(e) {
        if (e.response && e.response.status === 404) {
            console.log(`   ❌ Не найден`);
        } else {
            console.log(`   ⚠️ Ошибка: ${e.message}`);
        }
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
    
    // Получаем заголовки
    const headers = parseCSVLine(lines[0]);
    console.log(`📌 Заголовки колонок:`);
    headers.forEach((h, i) => {
        if (h && h.length > 0) console.log(`   ${i}: "${h}"`);
    });
    
    // Находим индексы нужных колонок
    const titleIndex = headers.findIndex(h => h && (h.includes('Русское название') || h.includes('Название русское')));
    const originalIndex = headers.findIndex(h => h && (h.includes('Оригинальное название') || h.includes('Оригинал')));
    const yearIndex = headers.findIndex(h => h && (h.includes('Год выпуска') || h.includes('Год')));
    
    console.log(`📍 Индексы: Название=${titleIndex}, Оригинал=${originalIndex}, Год=${yearIndex}`);
    
    if (titleIndex === -1 && originalIndex === -1) {
        console.error("❌ Не найдена колонка с названием!");
        process.exit(1);
    }
    
    // Собираем уникальные названия фильмов
    const movieTitles = new Map(); // используем Map, чтобы избежать дубликатов
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (!line.trim()) continue;
        
        const parts = parseCSVLine(line);
        
        let title = '';
        if (titleIndex !== -1 && parts[titleIndex]) {
            title = parts[titleIndex];
        }
        if (!title && originalIndex !== -1 && parts[originalIndex]) {
            title = parts[originalIndex];
        }
        
        // Очищаем название
        title = title.replace(/^"|"$/g, '').trim();
        
        // Пропускаем явно не-названия
        if (!title) continue;
        if (title === '—' || title === '-') continue;
        if (title.length < 2) continue;
        if (title.match(/^\d+\s*кбит/i)) continue;
        if (title.match(/TRACK_/i)) continue;
        if (title.includes('kbps')) continue;
        if (title.includes('Аудио')) continue;
        if (title.includes('H264')) continue;
        if (title.includes('AC3')) continue;
        if (title.includes('subrip')) continue;
        
        let year = '';
        if (yearIndex !== -1 && parts[yearIndex]) {
            const yearMatch = parts[yearIndex].match(/\d{4}/);
            if (yearMatch) year = yearMatch[0];
        }
        
        const key = `${title}_${year || 'no-year'}`;
        if (!movieTitles.has(key)) {
            movieTitles.set(key, { title, year });
        }
    }
    
    const movies = Array.from(movieTitles.values());
    console.log(`🎬 Уникальных фильмов для обработки: ${movies.length}`);
    
    // Выводим первые 10 для проверки
    console.log(`📋 Первые 10 фильмов:`);
    movies.slice(0, 10).forEach((m, i) => {
        console.log(`   ${i+1}. ${m.title} (${m.year || 'год не указан'})`);
    });
    
    let newCount = 0;
    let dailyLimit = 0;
    let skippedCount = 0;
    
    for (let i = 0; i < movies.length; i++) {
        const { title, year } = movies[i];
        
        // Проверяем кеш
        const cacheKey = `${title}_${year || 'no-year'}`;
        if (cache.posters[cacheKey] || cache.posters[title]) {
            skippedCount++;
            continue;
        }
        
        if (dailyLimit >= 480) { // оставляем небольшой запас
            console.log(`\n⚠️ Достигнут лимит ~500 запросов в сутки. Остановлено на ${i} фильме.`);
            console.log(`Завтра скрипт продолжит с того же места.`);
            break;
        }
        
        console.log(`🔍 [${i+1}/${movies.length}] ${title} (${year || '?'})`);
        const data = await searchKinopoisk(title, apiKey);
        dailyLimit++;
        
        if (data && data.posterUrl) {
            cache.posters[cacheKey] = data;
            console.log(`   ✅ Найден! Постер: ${data.posterUrl.substring(0, 50)}... (${dailyLimit}/500 сегодня)`);
            newCount++;
        } else {
            console.log(`   ❌ Не найден (${dailyLimit}/500 сегодня)`);
            // Сохраняем как не найденный, чтобы не искать снова
            cache.posters[cacheKey] = { notFound: true };
        }
        
        await new Promise(resolve => setTimeout(resolve, 350));
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
