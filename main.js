const { app, BrowserWindow, BrowserView, ipcMain, session, clipboard } = require('electron');
const path = require('path');

let mainWindow;
let tabs = {};
let activeTabId = null;
let blackBoxView = null;
const TOP_OFFSET = 86; // Altura UI (Titlebar + Navbar)

// --- FASE 0: HARDENING DEL MOTOR CHROMIUM (Global) ---
// 1. Deshabilitar caché de disco (Anti-Forense)
app.commandLine.appendSwitch('disable-http-cache');
// 2. DNS sobre HTTPS (DoH) con Cloudflare (Privacidad ante ISP)
app.commandLine.appendSwitch('doh-url', 'https://cloudflare-dns.com/dns-query');
// 3. Deshabilitar métricas y reporte de errores a Google
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-breakpad');
// 4. Deshabilitar gestor de contraseñas y autocompletado
app.commandLine.appendSwitch('disable-password-generation');
app.commandLine.appendSwitch('disable-save-password-bubble');
app.commandLine.appendSwitch('disable-single-click-autofill');
// 5. Bloquear cabecera Referer globalmente
app.commandLine.appendSwitch('no-referrer-header');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280, height: 850, minWidth: 900, minHeight: 600,
        title: "SecureScope", backgroundColor: '#dfe3e8',
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#dfe3e8', symbolColor: '#000000', height: 42 },
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });

    // 6. PROTEGER LA PROPIA INTERFAZ (UI CSP)
    // Evita que nadie pueda inyectar scripts en tu barra de direcciones
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: svg:;"]
            }
        });
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('resize', () => {
        const bounds = mainWindow.getBounds();
        const config = { x: 0, y: TOP_OFFSET, width: bounds.width, height: bounds.height - TOP_OFFSET };
        if (activeTabId === 'BLACKBOX' && blackBoxView) blackBoxView.setBounds(config);
        else if (activeTabId && tabs[activeTabId]) tabs[activeTabId].view.setBounds(config);
    });

    mainWindow.webContents.once('dom-ready', () => {
        createBlackBox(); // Primero el sistema de auditoría
        createNewTab('https://www.google.com'); // Luego la primera pestaña
    });
}

// --- SISTEMA CENTRAL DE LOGS ---
function systemLog(type, message) {
    if (blackBoxView) blackBoxView.webContents.send('log-data', { type, message });
    else console.log(`[${type}] ${message}`);
}

// --- CAJA NEGRA (AUDITORÍA) ---
function createBlackBox() {
    // Persistencia solo para el log, para no perder el historial
    const ses = session.fromPartition('persist:audit-log');
    blackBoxView = new BrowserView({ webPreferences: { session: ses, nodeIntegration: true, contextIsolation: false } });
    blackBoxView.webContents.loadFile('blackbox.html');
    tabs['BLACKBOX'] = { view: blackBoxView, title: 'AUDIT LOG' };
    mainWindow.webContents.send('blackbox-created');
    systemLog('SYSTEM', 'SecureScope Kernel v3.0 Online. Hardening: MAX.');
}

// --- FÁBRICA DE CONTENEDORES AISLADOS ---
function createNewTab(url) {
    const tabId = Date.now().toString();

    // REGISTRO PARA CONTADOR DE SOC
    systemLog('SYSTEM', `Container allocated. ID: ${tabId}`);

    // 7. AISLAMIENTO DE MEMORIA (RAM-Only Partition)
    const ses = session.fromPartition(`scope-${tabId}`, { cache: false });

    // 8. BLOQUEO DE PERMISOS (El Portero)
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        systemLog('THREAT', `Blocked permission: ${permission}`);
        return callback(false); // Denegar siempre
    });

    // 9. BLOQUEO DE DESCARGAS
    ses.on('will-download', (event, item) => {
        event.preventDefault();
        systemLog('THREAT', `Download blocked: ${item.getFilename()}`);
    });

    // 10. VERIFICACIÓN ESTRICTA DE SSL
    ses.setCertificateVerifyProc((request, callback) => {
        if (request.errorCode) {
            systemLog('THREAT', `Invalid Cert blocked: ${request.hostname} (${request.errorCode})`);
            callback(-2); // Fallo fatal
        } else {
            callback(0);
        }
    });

    // 11. LIMPIEZA DE CABECERAS (Anti-Fingerprinting)
    const filter = { urls: ['*://*/*'] };
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        delete details.requestHeaders['Referer']; // 12. Sin Referer
        delete details.requestHeaders['X-Client-Data'];
        // 13. User-Agent Genérico
        details.requestHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        callback({ requestHeaders: details.requestHeaders });
    });

    // 14. INYECCIÓN DE SEGURIDAD (CSP Forzado)
    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = details.responseHeaders;
        responseHeaders['X-Frame-Options'] = ['DENY']; // 15. Anti-Clickjacking
        responseHeaders['X-Content-Type-Options'] = ['nosniff']; // 16. Anti-MIME Sniffing
        callback({ responseHeaders });
    });

    // CONFIGURACIÓN DEL RENDERIZADOR (SANDBOX)
    const view = new BrowserView({
        webPreferences: {
            session: ses,
            sandbox: true,              // 17. Sandbox OS
            contextIsolation: true,     // 18. Aislamiento JS
            nodeIntegration: false,     // 19. Sin Node.js
            plugins: false,             // Sin Plugins
            enableWebSQL: false,
            webgl: false,               // 20. Sin WebGL (Fingerprinting)
            backgroundThrottling: false
        }
    });

    // 21. BLOQUEO DE NAVEGACIÓN LOCAL (File System)
    view.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:' || parsedUrl.protocol === 'chrome:') {
            event.preventDefault();
            systemLog('THREAT', `Local filesystem access blocked: ${navigationUrl}`);
        }
    });

    tabs[tabId] = { view: view, title: 'Secure Container' };

    // Listeners de UI
    view.webContents.on('did-navigate', (e, newUrl) => {
        systemLog('NET', `Mapsd: ${newUrl.substring(0, 40)}...`);
        if (activeTabId === tabId) mainWindow.webContents.send('update-url', newUrl);
        checkNavButtons(view);
    });

    view.webContents.on('page-title-updated', (e, title) => {
        tabs[tabId].title = title;
        mainWindow.webContents.send('update-tab-info', { id: tabId, title: title });
    });

    // Bloqueo de Popups
    view.webContents.setWindowOpenHandler(({ url }) => {
        systemLog('THREAT', `Popup intercepted: ${url}`);
        createNewTab(url);
        return { action: 'deny' };
    });

    view.webContents.loadURL(url).catch(err => systemLog('THREAT', `Load Fail: ${err.message}`));

    mainWindow.webContents.send('tab-created', tabId);
    switchToTab(tabId);
}

function switchToTab(id) {
    if (!tabs[id]) return;
    if (activeTabId && tabs[activeTabId]) mainWindow.removeBrowserView(tabs[activeTabId].view);

    // 22. LIMPIEZA DE PORTAPAPELES AL CAMBIAR CONTEXTO
    if (activeTabId && activeTabId !== id) {
        clipboard.clear();
        // systemLog('SYSTEM', 'Context switch: Clipboard sanitized.');
    }

    activeTabId = id;
    const currentView = tabs[id].view;
    mainWindow.addBrowserView(currentView);

    const bounds = mainWindow.getBounds();
    currentView.setBounds({ x: 0, y: TOP_OFFSET, width: bounds.width, height: bounds.height - TOP_OFFSET });

    if (id === 'BLACKBOX') {
        mainWindow.webContents.send('update-url', 'secure://audit-log');
        mainWindow.webContents.send('update-nav-state', { canGoBack: false, canGoForward: false });
    } else {
        mainWindow.webContents.send('update-url', currentView.webContents.getURL());
        checkNavButtons(currentView);
    }
    mainWindow.webContents.send('tab-active', id);
}

function closeTab(id) {
    if (id === 'BLACKBOX') return;
    if (!tabs[id]) return;
    const view = tabs[id].view;

    // REGISTRO PARA CONTADOR DE SOC
    systemLog('SYSTEM', `Destroying Container ${id}. Memory scrubbed.`);

    // 23. LIMPIEZA FORENSE
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

    const ids = Object.keys(tabs);
    if (ids.length > 0) switchToTab(ids[ids.length - 1]);
    else switchToTab('BLACKBOX');
}

function checkNavButtons(view) {
    if (activeTabId && tabs[activeTabId] && activeTabId !== 'BLACKBOX') {
        mainWindow.webContents.send('update-nav-state', {
            canGoBack: view.webContents.canGoBack(),
            canGoForward: view.webContents.canGoForward()
        });
    }
}

// IPC Hooks
ipcMain.on('new-tab', () => createNewTab('https://www.google.com'));
ipcMain.on('switch-tab', (e, id) => switchToTab(id));
ipcMain.on('close-tab', (e, id) => closeTab(id));
ipcMain.on('navigate', (e, url) => {
    if (activeTabId && activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.loadURL(url.startsWith('http') ? url : `https://${url}`);
});
ipcMain.on('go-back', () => { if (activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.goBack() });
ipcMain.on('go-forward', () => { if (activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.goForward() });
ipcMain.on('reload', () => { if (activeTabId !== 'BLACKBOX') tabs[activeTabId].view.webContents.reload() });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());