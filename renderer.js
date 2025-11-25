const { ipcRenderer } = require('electron');

try {
    const tabsContainer = document.getElementById('tabs-container');
    const newTabBtn = document.getElementById('new-tab-btn');
    const urlInput = document.getElementById('url-input');
    const secureIcon = document.getElementById('secure-icon-wrapper');
    const profileMenu = document.getElementById('profile-menu');

    let profiles = [];

    // Fetch profiles on load
    ipcRenderer.send('get-profiles');
    ipcRenderer.on('profiles-data', (e, data) => {
        profiles = data;
        renderProfileMenu();
    });

    function renderProfileMenu() {
        if (!profileMenu) return;
        profileMenu.innerHTML = '';
        profiles.forEach(p => {
            const item = document.createElement('div');
            item.className = 'profile-item';
            item.innerText = p.name;
            item.onclick = (e) => {
                e.stopPropagation();
                console.log('Creating tab with profile:', p.key);
                ipcRenderer.send('create-tab-with-profile', { profile: p.key });
                profileMenu.classList.remove('visible');
            };
            profileMenu.appendChild(item);
        });
    }

    if (newTabBtn) {
        newTabBtn.onclick = (e) => {
            e.stopPropagation();
            if (profileMenu.classList.contains('visible')) {
                profileMenu.classList.remove('visible');
            } else {
                profileMenu.classList.add('visible');
            }
        };
    }

    // Close menu when clicking outside
    document.addEventListener('click', () => {
        if (profileMenu) profileMenu.classList.remove('visible');
    });

    if (document.getElementById('btn-back')) document.getElementById('btn-back').onclick = () => ipcRenderer.send('go-back');
    if (document.getElementById('btn-fwd')) document.getElementById('btn-fwd').onclick = () => ipcRenderer.send('go-forward');
    if (document.getElementById('btn-reload')) document.getElementById('btn-reload').onclick = () => ipcRenderer.send('reload');
    if (secureIcon) secureIcon.onclick = () => ipcRenderer.send('switch-tab', 'BLACKBOX');

    if (urlInput) {
        urlInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') { ipcRenderer.send('navigate', urlInput.value); urlInput.blur(); } });
        urlInput.addEventListener('focus', () => urlInput.select());
    }

    ipcRenderer.on('blackbox-created', () => {
        const el = document.createElement('div'); el.className = 'tab blackbox'; el.id = 'tab-BLACKBOX'; el.title = 'Audit Log';
        el.innerHTML = `<svg viewBox="0 0 24 24"><path d="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z" /></svg>`;
        el.onclick = () => ipcRenderer.send('switch-tab', 'BLACKBOX');
        if(tabsContainer) tabsContainer.prepend(el);
    });

    function createTab(id) {
        const el = document.createElement('div'); el.className = 'tab'; el.id = `tab-${id}`;
        el.innerHTML = `<span class="tab-text">Cargando...</span><div class="tab-close" onclick="closeTab(event, '${id}')" title="Cerrar Contenedor"><svg viewBox="0 0 24 24"><path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" /></svg></div>`;
        el.onclick = () => ipcRenderer.send('switch-tab', id);
        el.onauxclick = (e) => { if (e.button === 1) closeTab(e, id); };
        if(tabsContainer) {
            tabsContainer.insertBefore(el, newTabBtn);
            el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }

    window.closeTab = (e, id) => {
        e.stopPropagation();
        const el = document.getElementById(`tab-${id}`);
        if (el) {
            el.classList.add('closing');
            setTimeout(() => {
                el.remove();
                ipcRenderer.send('close-tab', id);
            }, 200);
        } else {
             ipcRenderer.send('close-tab', id);
        }
    };

    ipcRenderer.on('tab-created', (e, id) => createTab(id));
    ipcRenderer.on('tab-active', (e, id) => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const active = document.getElementById(`tab-${id}`);
        if (active) {
            active.classList.add('active');
            active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    });
    ipcRenderer.on('update-url', (e, url) => { if(urlInput) urlInput.value = url; });
    ipcRenderer.on('update-tab-info', (e, data) => { const el = document.getElementById(`tab-${data.id}`); if (el) el.querySelector('.tab-text').innerText = data.title; });
    ipcRenderer.on('update-nav-state', (e, state) => {
        if(document.getElementById('btn-back')) document.getElementById('btn-back').disabled = !state.canGoBack;
        if(document.getElementById('btn-fwd')) document.getElementById('btn-fwd').disabled = !state.canGoForward;
    });

    console.log('Renderer script loaded successfully');

} catch (err) {
    console.error('Renderer Script Error:', err);
    alert('Renderer Error: ' + err.message);
}
