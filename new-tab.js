const { ipcRenderer } = require('electron');

const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value;
    if (query) {
        const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
        ipcRenderer.send('navigate', searchUrl);
    }
});
