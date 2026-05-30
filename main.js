// Глобальные переменные
let movies = [];
let filtered = [];
let page = 1;
let currentSort = 'default';
const perPage = 40;

// Функции
function escape(s) { if (!s) return ''; return String(s).replace(/[&<>]/g, m => m==='&'?'&amp;':m==='<'?'&lt;':'&gt;'); }

// Загрузка данных
async function loadMovies() {
    try {
        const res = await fetch('./movies.json');
        const data = await res.json();
        movies = data.movies;
        
        // Заполняем фильтры
        const genres = new Set();
        const years = new Set();
        const countries = new Set();
        const actors = new Set();
        
        for (let m of movies) {
            if (m.genre) m.genre.split(/[,/]/).forEach(g => { if(g && g.trim()) genres.add(g.trim()); });
            if (m.year && m.year !== '—') years.add(m.year);
            if (m.country && m.country !== '—') countries.add(m.country);
            if (m.actors) m.actors.split(/[,;]/).forEach(a => { if(a && a.trim() && a.length > 2) actors.add(a.trim()); });
        }
        
        const genreSel = document.getElementById('genre');
        const yearSel = document.getElementById('year');
        const countrySel = document.getElementById('country');
        const actorSel = document.getElementById('actor');
        
        genreSel.innerHTML = '<option value="">Все жанры</option>';
        yearSel.innerHTML = '<option value="">Все годы</option>';
        countrySel.innerHTML = '<option value="">Все страны</option>';
        actorSel.innerHTML = '<option value="">Все актеры</option>';
        
        [...genres].sort().forEach(g => genreSel.innerHTML += `<option value="${escape(g)}">${escape(g).substring(0, 45)}</option>`);
        [...years].sort((a,b)=>parseInt(b)-parseInt(a)).forEach(y => yearSel.innerHTML += `<option value="${y}">${y}</option>`);
        [...countries].sort().forEach(c => countrySel.innerHTML += `<option value="${escape(c)}">${escape(c).substring(0, 45)}</option>`);
        [...actors].sort().forEach(a => actorSel.innerHTML += `<option value="${escape(a)}">${escape(a).substring(0, 45)}</option>`);
        
        filtered = [...movies];
        applyFilters();
        
    } catch(e) {
        document.getElementById('stats').innerHTML = 'Ошибка: ' + e.message;
    }
}

// Применение фильтров
function applyFilters() {
    const search = document.getElementById('search').value.toLowerCase();
    const genre = document.getElementById('genre').value;
    const year = document.getElementById('year').value;
    const country = document.getElementById('country').value;
    const actor = document.getElementById('actor').value;
    
    let result = movies.filter(m => {
        const searchFields = [m.title, m.originalTitle, m.genre, m.actors, m.director, m.country].join(' ').toLowerCase();
        if (search && !searchFields.includes(search)) return false;
        if (genre && !(m.genre || '').includes(genre)) return false;
        if (year && m.year !== year) return false;
        if (country && !(m.country || '').includes(country)) return false;
        if (actor && !(m.actors || '').includes(actor)) return false;
        return true;
    });
    
    // Сортировка
    switch(currentSort) {
        case 'year_asc': result.sort((a,b) => (parseInt(a.year)||0) - (parseInt(b.year)||0)); break;
        case 'year_desc': result.sort((a,b) => (parseInt(b.year)||0) - (parseInt(a.year)||0)); break;
        case 'title_asc': result.sort((a,b) => a.title.localeCompare(b.title)); break;
        case 'title_desc': result.sort((a,b) => b.title.localeCompare(a.title)); break;
        default: break;
    }
    
    filtered = result;
    page = 1;
    render();
}

// Отображение
function render() {
    const start = (page-1)*perPage;
    const pageMovies = filtered.slice(start, start+perPage);
    const totalPages = Math.ceil(filtered.length / perPage);
    
    document.getElementById('stats').innerHTML = `🎬 ${filtered.length} из ${movies.length} фильмов | Стр. ${page} из ${totalPages || 1}`;
    
    if (pageMovies.length === 0) {
        document.getElementById('movies').innerHTML = '<div style="text-align:center">😔 Ничего не найдено</div>';
        document.getElementById('pagination').innerHTML = '';
        return;
    }
    
    let html = '';
    for (let m of pageMovies) {
        html += `
            <div class="card" onclick="showDetails(${movies.findIndex(x=>x.id===m.id)})">
                <div class="title">${escape(m.title).substring(0, 60)}</div>
                <div class="year">📅 ${m.year || '—'} | 🎬 ${(m.director || '—').substring(0, 40)}</div>
                <div class="year">🎭 ${(m.genre || '—').substring(0, 60)}</div>
            </div>
        `;
    }
    document.getElementById('movies').innerHTML = html;
    
    let pagHtml = '';
    if (totalPages > 1) {
        pagHtml = `<button onclick="goPage(${page-1})" ${page===1?'disabled':''}>◀ Назад</button>`;
        pagHtml += `<span style="margin:0 15px">${page} / ${totalPages}</span>`;
        pagHtml += `<button onclick="goPage(${page+1})" ${page===totalPages?'disabled':''}>Вперед ▶</button>`;
    }
    document.getElementById('pagination').innerHTML = pagHtml;
    window.scrollTo({ top: 0 });
}

function goPage(p) { page = p; render(); }

// Показ деталей
window.showDetails = function(idx) {
    const m = movies[idx];
    if (!m) return;
    let html = `<h3>${escape(m.title)}</h3>`;
    if (m.originalTitle) html += `<div class="detail-line"><span class="detail-label">Оригинал:</span> ${escape(m.originalTitle)}</div>`;
    if (m.year) html += `<div class="detail-line"><span class="detail-label">Год:</span> ${m.year}</div>`;
    if (m.country) html += `<div class="detail-line"><span class="detail-label">Страна:</span> ${escape(m.country)}</div>`;
    if (m.genre) html += `<div class="detail-line"><span class="detail-label">Жанр:</span> ${escape(m.genre)}</div>`;
    if (m.director) html += `<div class="detail-line"><span class="detail-label">Режиссер:</span> ${escape(m.director)}</div>`;
    if (m.actors) html += `<div class="detail-line"><span class="detail-label">Актеры:</span> ${escape(m.actors).substring(0, 300)}</div>`;
    if (m.description) html += `<div class="detail-line"><span class="detail-label">Описание:</span> ${escape(m.description)}</div>`;
    if (m.audioInfo) html += `<div class="detail-line"><span class="detail-label">Аудио:</span> ${escape(m.audioInfo).substring(0, 200)}</div>`;
    if (m.subtitles) html += `<div class="detail-line"><span class="detail-label">Субтитры:</span> ${escape(m.subtitles)}</div>`;
    if (m.kinopoiskLink && m.kinopoiskLink.startsWith('http')) {
        html += `<div class="detail-line"><a href="${escape(m.kinopoiskLink)}" target="_blank">🎬 Кинопоиск</a></div>`;
    }
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
};

// Настройка обработчиков
function initEventListeners() {
    document.getElementById('search').addEventListener('input', () => { setTimeout(applyFilters, 300); });
    document.getElementById('genre').addEventListener('change', applyFilters);
    document.getElementById('year').addEventListener('change', applyFilters);
    document.getElementById('country').addEventListener('change', applyFilters);
    document.getElementById('actor').addEventListener('change', applyFilters);
    document.getElementById('sortSelect').addEventListener('change', (e) => {
        currentSort = e.target.value;
        applyFilters();
    });
    document.getElementById('randomBtn').addEventListener('click', () => {
        if (filtered.length === 0) return;
        const rand = Math.floor(Math.random() * filtered.length);
        const idx = movies.findIndex(x => x.id === filtered[rand].id);
        showDetails(idx);
    });
    document.getElementById('closeModal').onclick = () => document.getElementById('modal').style.display = 'none';
    window.onclick = (e) => { if (e.target === document.getElementById('modal')) document.getElementById('modal').style.display = 'none'; };
}

// Тёмная тема
function initTheme() {
    const themeToggle = document.getElementById('themeToggle');
    if (localStorage.getItem('theme') === 'light') {
        document.body.classList.add('light');
        themeToggle.textContent = '☀️';
    }
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light');
        const isLight = document.body.classList.contains('light');
        themeToggle.textContent = isLight ? '☀️' : '🌙';
        localStorage.setItem('theme', isLight ? 'light' : 'dark');
    });
}

// Запуск
initTheme();
initEventListeners();
loadMovies();
