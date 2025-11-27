const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value;
    if (query) {
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        window.electron.sendNavigate(searchUrl);
    }
});

document.querySelectorAll('.quick-links a').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        window.electron.sendNavigate(e.currentTarget.href);
    });
});
