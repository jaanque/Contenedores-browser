const searchForm = document.getElementById('search-form');
const searchInput = document.getElementById('search-input');

searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const query = searchInput.value;
    if (query) {
        // Basic URL detection
        if (query.includes('.') && !query.includes(' ')) {
             let url = query;
             if (!url.startsWith('http')) url = 'https://' + url;
             window.electron.sendNavigate(url);
        } else {
             const searchUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
             window.electron.sendNavigate(searchUrl);
        }
    }
});

function loadTopSites() {
    // In a real app this would come from history analysis.
    // We'll mock some top sites if the backend returns empty or just use the backend's return.
    // But since I don't see the backend implementation of 'get-top-sites' I assume it might return nothing.
    // Let's protect against errors.

    let topSites = [];
    try {
        topSites = window.electron.sendSync('get-top-sites');
    } catch (e) {
        console.error("Failed to get top sites", e);
    }

    if (!topSites || topSites.length === 0) {
        topSites = [
            'https://duckduckgo.com',
            'https://www.youtube.com',
            'https://www.wikipedia.org',
            'https://twitter.com',
            'https://github.com'
        ];
    }

    const quickLinksContainer = document.querySelector('#top-sites .quick-links');
    quickLinksContainer.innerHTML = '';

    topSites.forEach(url => {
        let domain = url;
        try {
            domain = new URL(url).hostname.replace('www.', '');
        } catch (e) {}

        const link = document.createElement('a');
        link.href = url;

        // New structure matching the CSS
        link.innerHTML = `
            <div class="site-icon-container">
                <span class="icon" style="background-image: url('https://logo.clearbit.com/${domain}')"></span>
            </div>
            <span class="title">${domain}</span>
        `;

        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.electron.sendNavigate(e.currentTarget.href);
        });
        quickLinksContainer.appendChild(link);
    });
}

function loadRecentlyClosedTabs() {
    let recentlyClosedTabs = [];
    try {
        recentlyClosedTabs = window.electron.sendSync('get-recently-closed-tabs');
    } catch (e) {
         console.error("Failed to get recently closed", e);
    }

    const container = document.getElementById('recently-closed');
    const ul = container.querySelector('ul');
    ul.innerHTML = '';

    if (recentlyClosedTabs && recentlyClosedTabs.length > 0) {
        container.style.display = 'block';
        recentlyClosedTabs.forEach(tab => {
            const item = document.createElement('li');
            item.innerHTML = `
                <span>${tab.title || 'Pestaña sin título'}</span>
                <button>Reabrir</button>
            `;
            item.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                window.electron.send('reopen-tab', tab);
                // Ideally we reload this list, but we'd need to wait for backend update.
                // Simple timeout for now.
                setTimeout(loadRecentlyClosedTabs, 500);
            });
            ul.appendChild(item);
        });
    } else {
        container.style.display = 'none';
    }
}

function loadTips() {
    const tips = [
        "Usa la Caja Negra para monitorizar el consumo de recursos.",
        "SecureScope aísla cada pestaña por seguridad.",
        "Puedes cerrar procesos desde la Caja Negra."
    ];
    const tipElement = document.getElementById('tip-text');
    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    if (tipElement) tipElement.textContent = randomTip;
}

loadTopSites();
loadRecentlyClosedTabs();
loadTips();
