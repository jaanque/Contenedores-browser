const { ipcRenderer } = require('electron');

const DEFAULT_FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L8.38 15.21A8.94 8.94 0 0 1 11 19.93zm8.21-3.21c-.49-1.09-1.18-2.08-2.02-2.92l-4.1-4.1c.36-.08.72-.12 1.09-.12.91 0 1.77.21 2.54.6l3.35-3.35A9.914 9.914 0 0 1 22 12c0 2.12-.67 4.08-1.79 5.72z"/></svg>`;

// Window Controls
document.getElementById('minimize-btn').addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
});
document.getElementById('maximize-btn').addEventListener('click', () => {
    ipcRenderer.send('maximize-window');
});
document.getElementById('close-btn').addEventListener('click', () => {
    ipcRenderer.send('close-window');
});

// UI Elements
const tabsContainer = document.getElementById('tab-list');
const newTabBtn = document.getElementById('new-tab-btn');
const urlInput = document.getElementById('url-input');
const blackboxBtn = document.getElementById('blackbox-btn');
const readerModeBtn = document.getElementById('reader-mode-btn');

ipcRenderer.on('update-reader-state', (e, isReadable) => {
    readerModeBtn.style.display = isReadable ? 'flex' : 'none';
});

readerModeBtn.onclick = () => {
    ipcRenderer.send('toggle-reader-mode');
};

newTabBtn.onclick = () => ipcRenderer.send('new-tab');

document.getElementById('btn-back').onclick = () => ipcRenderer.send('go-back');
document.getElementById('btn-fwd').onclick = () => ipcRenderer.send('go-forward');
document.getElementById('btn-reload').onclick = () => ipcRenderer.send('reload');
blackboxBtn.onclick = () => ipcRenderer.send('switch-tab', 'BLACKBOX');

urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        ipcRenderer.send('navigate', urlInput.value);
        urlInput.blur();
    }
});
urlInput.addEventListener('focus', () => urlInput.select());

function createTab(id) {
    const el = document.createElement('div');
    el.className = 'tab';
    el.id = `tab-${id}`;

    const favicon = document.createElement('img');
    favicon.className = 'tab-favicon';
    favicon.src = `data:image/svg+xml;base64,${btoa(DEFAULT_FAVICON)}`;
    favicon.onerror = () => { favicon.src = `data:image/svg+xml;base64,${btoa(DEFAULT_FAVICON)}`; };

    const text = document.createElement('span');
    text.className = 'tab-text';
    text.innerText = 'Cargando...';

    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Cerrar Pestaña';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>`;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(e, id);
    });

    el.append(favicon, text, closeBtn);
    el.onclick = () => ipcRenderer.send('switch-tab', id);
    el.onauxclick = (e) => { if (e.button === 1) closeTab(e, id); };

    // Insert before the new tab button
    tabsContainer.insertBefore(el, newTabBtn);
    // Keep visible
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.closeTab = (e, id) => {
    e.stopPropagation();
    const el = document.getElementById(`tab-${id}`);
    if (el) {
        // Optional animation
        el.style.width = '0px';
        el.style.padding = '0px';
        el.style.opacity = '0';
        setTimeout(() => {
            el.remove();
            ipcRenderer.send('close-tab', id);
        }, 150);
    }
};

ipcRenderer.on('tab-created', (e, id) => createTab(id));
ipcRenderer.on('tab-active', (e, id) => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    if (id !== 'BLACKBOX') {
        const active = document.getElementById(`tab-${id}`);
        if (active) {
            active.classList.add('active');
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
});
ipcRenderer.on('update-url', (e, url) => {
    // Hide protocol for cleaner look if needed, but for security show it?
    // Chrome hides https:// and www.
    let displayUrl = url;
    if (url.startsWith('https://')) displayUrl = url.substring(8);
    if (url.startsWith('http://')) displayUrl = url.substring(7);
    if (displayUrl.startsWith('www.')) displayUrl = displayUrl.substring(4);
    if (url.startsWith('file://')) displayUrl = 'SecureScope Local';

    // If focused, we might want to show full URL. For now just update value.
    // If it's the new tab page, show empty or placeholder
    if (url.includes('new-tab.html')) {
        urlInput.value = '';
        urlInput.placeholder = 'Buscar o escribir URL';
    } else {
        urlInput.value = url; // Keep full URL for editing
    }
});

ipcRenderer.on('update-tab-info', (e, data) => {
    const el = document.getElementById(`tab-${data.id}`);
    if (el) el.querySelector('.tab-text').innerText = data.title;
});
ipcRenderer.on('update-tab-favicon', (e, data) => {
    const el = document.getElementById(`tab-${data.id}`);
    if (el) el.querySelector('.tab-favicon').src = data.favicon;
});
ipcRenderer.on('update-nav-state', (e, state) => {
    document.getElementById('btn-back').disabled = !state.canGoBack;
    document.getElementById('btn-fwd').disabled = !state.canGoForward;
});
