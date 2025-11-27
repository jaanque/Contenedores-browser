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

function loadTopSites() {
    const topSites = window.electron.sendSync('get-top-sites');
    const quickLinksContainer = document.querySelector('#top-sites .quick-links');
    quickLinksContainer.innerHTML = '';
    topSites.forEach(url => {
        const domain = new URL(url).hostname.replace('www.', '');
        const link = document.createElement('a');
        link.href = url;
        link.innerHTML = `<span></span>${domain}`;
        link.querySelector('span').style.backgroundImage = `url(https://logo.clearbit.com/${domain})`;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.electron.sendNavigate(e.currentTarget.href);
        });
        quickLinksContainer.appendChild(link);
    });
}

function loadRecentlyClosedTabs() {
    const recentlyClosedTabs = window.electron.sendSync('get-recently-closed-tabs');
    const recentlyClosedContainer = document.querySelector('#recently-closed ul');
    recentlyClosedContainer.innerHTML = '';
    recentlyClosedTabs.forEach(tab => {
        const item = document.createElement('li');
        item.innerHTML = `
            <span>${tab.title}</span>
            <button data-id="${tab.id}">Reabrir</button>
        `;
        item.querySelector('button').addEventListener('click', () => {
            window.electron.send('reopen-tab', tab);
            loadRecentlyClosedTabs();
        });
        recentlyClosedContainer.appendChild(item);
    });
}

function loadTips() {
    const tips = [
        "Usa la Caja Negra para monitorizar el consumo de recursos de cada contenedor.",
        "SecureScope aísla cada pestaña en su propio contenedor para mejorar la seguridad.",
        "Puedes terminar procesos colgados desde la Caja Negra.",
        "El modo lector (próximamente) te permitirá leer artículos sin distracciones."
    ];
    const tipElement = document.querySelector('#tips p');
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    tipElement.textContent = randomTip;
}

loadTopSites();
loadRecentlyClosedTabs();
loadTips();
