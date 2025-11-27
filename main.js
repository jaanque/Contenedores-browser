const { app, BrowserWindow, BrowserView, ipcMain, session, clipboard } = require('electron');
const path = require('path');

let mainWindow;
let tabs = {};
let activeTabId = null;
let blackBoxView = null;
const TOP_OFFSET = 52;
const SIDEBAR_WIDTH = 250;
let isSidebarOpen = false;

function getAppContentBounds() {
    const bounds = mainWindow.getBounds();
    const x = isSidebarOpen ? SIDEBAR_WIDTH : 0;
    return { x: x, y: TOP_OFFSET, width: bounds.width - x, height: bounds.height - TOP_OFFSET };
}

// --- FASE 0: HARDENING DEL MOTOR CHROMIUM (Global) ---
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('doh-url', 'https://cloudflare-dns.com/dns-query');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-password-generation');
app.commandLine.appendSwitch('disable-save-password-bubble');
app.commandLine.appendSwitch('disable-single-click-autofill');
app.commandLine.appendSwitch('no-referrer-header');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 850, minWidth: 900, minHeight: 600,
        title: "SecureScope", backgroundColor: '#DEE1E6',
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';"]
            }
        });
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('resize', () => {
        if (activeTabId && tabs[activeTabId]) {
            tabs[activeTabId].view.setBounds(getAppContentBounds());
        }
    });

    mainWindow.webContents.once('dom-ready', () => {
        createBlackBox();
        createNewTab();
        setInterval(updateBlackBoxData, 2000);
    });

    // IPC Handlers for window controls
    ipcMain.on('minimize-window', () => mainWindow.minimize());
    ipcMain.on('maximize-window', () => {
        if (mainWindow.isMaximized()) {
            mainWindow.unmaximize();
        } else {
            mainWindow.maximize();
        }
    });
    ipcMain.on('close-window', () => mainWindow.close());
}

// --- CAJA NEGRA (AUDITORÍA) ---
function createBlackBox() {
    const ses = session.fromPartition('persist:audit-log');
    blackBoxView = new BrowserView({ webPreferences: { session: ses, nodeIntegration: true, contextIsolation: false } });
    blackBoxView.webContents.loadFile('blackbox.html');
    tabs['BLACKBOX'] = { view: blackBoxView, title: 'Caja Negra' };
    mainWindow.webContents.send('blackbox-created');
}

function logToBlackBox(message) {
    if (blackBoxView && !blackBoxView.webContents.isDestroyed()) {
        const timestamp = new Date().toLocaleTimeString();
        blackBoxView.webContents.send('log-event', `[${timestamp}] ${message}`);
    }
}

function updateBlackBoxData() {
    if (!blackBoxView || blackBoxView.webContents.isDestroyed()) return;

    const processMetrics = app.getAppMetrics();
    let totalRam = 0;

    const containersData = [];
    for (const tabId in tabs) {
        if (tabId === 'BLACKBOX') continue;

        const tab = tabs[tabId];
        if (tab.view && !tab.view.webContents.isDestroyed()) {
            const pid = tab.view.webContents.getOSProcessId();
            const metric = processMetrics.find(p => p.pid === pid);
            const ram = metric ? (metric.memory.privateBytes / 1024 / 1024) : 0; // en MB
            totalRam += ram;

            containersData.push({
                id: tabId,
                title: tab.title,
                state: tab.status || 'Activo',
                ram: ram.toFixed(2),
                url: tab.view.webContents.getURL(),
                pid: pid
            });
        }
    }
    blackBoxView.webContents.send('update-containers', containersData, Math.round(totalRam));
}

// --- FÁBRICA DE CONTENEDORES AISLADOS ---
function createNewTab(url = `file://${path.join(__dirname, 'new-tab.html')}`) {
    logToBlackBox(`Creando nuevo contenedor con URL: ${url}`);
    const tabId = Date.now().toString();
    const ses = session.fromPartition(`scope-${tabId}`, { cache: false });

    ses.setPermissionRequestHandler((webContents, permission, callback) => callback(false));
    ses.on('will-download', (event) => event.preventDefault());

    ses.setCertificateVerifyProc((request, callback) => {
        callback(request.errorCode ? -2 : 0);
    });

    const filter = { urls: ['*://*/*'] };
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        delete details.requestHeaders['Referer'];
        delete details.requestHeaders['X-Client-Data'];
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        callback({ requestHeaders: details.requestHeaders });
    });

    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = details.responseHeaders;
        responseHeaders['X-Frame-Options'] = ['DENY'];
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        callback({ responseHeaders });
    });

    const view = new BrowserView({
        webPreferences: {
            session: ses,
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
            plugins: false,
            enableWebSQL: false,
            webgl: false,
            backgroundThrottling: false
        }
    });

    view.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:' || parsedUrl.protocol === 'chrome:') {
            event.preventDefault();
        }
    });

    tabs[tabId] = { view: view, title: 'Contenedor Seguro', status: 'Cargando...' };

    view.webContents.on('did-start-loading', () => { tabs[tabId].status = 'Cargando...'; updateBlackBoxData(); });
    view.webContents.on('did-stop-loading', () => { tabs[tabId].status = 'Activo'; updateBlackBoxData(); });
    view.webContents.on('unresponsive', () => { tabs[tabId].status = 'Colgado'; updateBlackBoxData(); });
    view.webContents.on('responsive', () => { tabs[tabId].status = 'Activo'; updateBlackBoxData(); });
    view.webContents.on('crashed', () => { tabs[tabId].status = 'Fallido'; updateBlackBoxData(); });

    view.webContents.on('did-navigate', (e, newUrl) => {
        logToBlackBox(`Contenedor ${tabId} navegó a: ${newUrl}`);
        if (activeTabId === tabId) mainWindow.webContents.send('update-url', newUrl);
        checkNavButtons(view);
    });

    view.webContents.on('page-title-updated', (e, title) => {
        tabs[tabId].title = title;
        mainWindow.webContents.send('update-tab-info', { id: tabId, title: title });
        updateBlackBoxData();
    });

    view.webContents.on('page-favicon-updated', (e, favicons) => {
        if (favicons && favicons.length > 0) {
            mainWindow.webContents.send('update-tab-favicon', { id: tabId, favicon: favicons[0] });
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        createNewTab(url);
        return { action: 'deny' };
    });

    view.webContents.loadURL(url).catch(console.error);

    mainWindow.webContents.send('tab-created', tabId);
    switchToTab(tabId);
    updateBlackBoxData();
}

function switchToTab(id) {
    logToBlackBox(`Cambiando a contenedor: ${id}`);
    if (!tabs[id]) return;
    if (activeTabId && tabs[activeTabId]) {
        mainWindow.removeBrowserView(tabs[activeTabId].view);
    }

    if (activeTabId && activeTabId !== id) {
        clipboard.clear();
    }

    activeTabId = id;
    const currentView = tabs[id].view;
    mainWindow.addBrowserView(currentView);

    currentView.setBounds(getAppContentBounds());

    if (id === 'BLACKBOX') {
        updateBlackBoxData();
        mainWindow.webContents.send('update-url', 'secure://caja-negra');
        mainWindow.webContents.send('update-nav-state', { canGoBack: false, canGoForward: false });
    } else {
        mainWindow.webContents.send('update-url', currentView.webContents.getURL());
        checkNavButtons(currentView);
    }
    mainWindow.webContents.send('tab-active', id);
}

function closeTab(id) {
    if (id === 'BLACKBOX' || !tabs[id]) return;
    logToBlackBox(`Cerrando contenedor: ${id}`);
    const view = tabs[id].view;

    clipboard.clear();
    view.webContents.session.clearCache();
    view.webContents.session.clearStorageData();
    view.webContents.session.clearAuthCache();

    if (activeTabId === id) {
        mainWindow.removeBrowserView(view);
        activeTabId = null;
    }
    view.webContents.destroy();
    delete tabs[id];

    const ids = Object.keys(tabs).filter(k => k !== 'BLACKBOX');
    if (ids.length > 0) {
        switchToTab(ids[ids.length - 1]);
    } else {
        switchToTab('BLACKBOX');
    }
    updateBlackBoxData();
}

function checkNavButtons(view) {
    if (activeTabId && tabs[activeTabId] && activeTabId !== 'BLACKBOX') {
        mainWindow.webContents.send('update-nav-state', {
            canGoBack: view.webContents.navigationHistory.canGoBack(),
            canGoForward: view.webContents.navigationHistory.canGoForward()
        });
    }
}

// IPC Hooks
ipcMain.on('sidebar-state-change', (e, isOpen) => {
    isSidebarOpen = isOpen;
    if (activeTabId && tabs[activeTabId]) {
        tabs[activeTabId].view.setBounds(getAppContentBounds());
    }
});
ipcMain.on('new-tab', () => createNewTab());
ipcMain.on('switch-tab', (e, id) => switchToTab(id));
ipcMain.on('close-tab', (e, id) => closeTab(id));
ipcMain.on('navigate', (e, url) => {
    if (activeTabId && activeTabId !== 'BLACKBOX') {
        let finalUrl;
        try {
            const parsedUrl = new URL(url);
            finalUrl = parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:' ? url : `https://${url}`;
        } catch (_) {
            finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(url)}`;
        }
        tabs[activeTabId].view.webContents.loadURL(finalUrl);
    }
});
ipcMain.on('go-back', () => { if (activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.navigationHistory.goBack() });
ipcMain.on('go-forward', () => { if (activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.navigationHistory.goForward() });
ipcMain.on('reload', () => { if (activeTabid !== 'BLACKBOX') tabs[activeTabId].view.webContents.reload() });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());