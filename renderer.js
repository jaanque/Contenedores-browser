const { ipcRenderer } = require('electron');

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

const tabsContainer = document.getElementById('tabs-container');
const newTabBtn = document.getElementById('new-tab-btn');
const urlInput = document.getElementById('url-input');
const blackboxBtn = document.getElementById('blackbox-btn');

newTabBtn.onclick = () => ipcRenderer.send('new-tab');
document.getElementById('btn-back').onclick = () => ipcRenderer.send('go-back');
document.getElementById('btn-fwd').onclick = () => ipcRenderer.send('go-forward');
document.getElementById('btn-reload').onclick = () => ipcRenderer.send('reload');
blackboxBtn.onclick = () => ipcRenderer.send('switch-tab', 'BLACKBOX');

urlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { ipcRenderer.send('navigate', urlInput.value); urlInput.blur(); } });
urlInput.addEventListener('focus', () => urlInput.select());

function createTab(id) {
    const el = document.createElement('div');
    el.className = 'tab';
    el.id = `tab-${id}`;

    const text = document.createElement('span');
    text.className = 'tab-text';
    text.innerText = 'Cargando...';

    const closeBtn = document.createElement('div');
    closeBtn.className = 'tab-close';
    closeBtn.title = 'Cerrar Contenedor';
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg>`;
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(e, id);
    });

    el.append(text, closeBtn);
    el.onclick = () => ipcRenderer.send('switch-tab', id);
    el.onauxclick = (e) => { if (e.button === 1) closeTab(e, id); };

    tabsContainer.insertBefore(el, newTabBtn);
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

window.closeTab = (e, id) => { e.stopPropagation(); const el = document.getElementById(`tab-${id}`); if (el) { el.classList.add('closing'); setTimeout(() => { el.remove(); ipcRenderer.send('close-tab', id); }, 200); } };

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
ipcRenderer.on('update-url', (e, url) => urlInput.value = url);
ipcRenderer.on('update-tab-info', (e, data) => { const el = document.getElementById(`tab-${data.id}`); if (el) el.querySelector('.tab-text').innerText = data.title; });
ipcRenderer.on('update-nav-state', (e, state) => { document.getElementById('btn-back').disabled = !state.canGoBack; document.getElementById('btn-fwd').disabled = !state.canGoForward; });
