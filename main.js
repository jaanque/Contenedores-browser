const { app, BrowserWindow, BrowserView, ipcMain, session, clipboard, dialog } = require('electron');
const path = require('path');

// --- STATE MANAGEMENT ---
let mainWindow = null;
let tabs = {}; // { tabId: { view, title, profile, proxy, ttl, creationTime, timer } }
let activeTabId = null;
let blackBoxView = null;
const TOP_OFFSET = 86;

// --- CONFIGURATION ---
const PROFILES = {
    STANDARD: {
        name: 'Standard',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        proxy: null,
        persistence: false,
        ttl: 0,
        webPreferences: {}
    },
    MALWARE_ANALYST: {
        name: 'Malware Analyst',
        userAgent: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
        proxy: 'socks5://127.0.0.1:9050',
        persistence: false,
        ttl: 600000, // 10 mins
        webPreferences: {
            images: true
        }
    },
    BANKING: {
        name: 'Banking',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Safari/605.1.15',
        proxy: null,
        persistence: true,
        ttl: 0,
        webPreferences: {}
    },
    LEGACY: {
        name: 'Legacy',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko',
        proxy: null,
        persistence: false,
        ttl: 0,
        webPreferences: {
            webgl: true,
            enableWebSQL: true
        }
    }
};

// --- CLI FLAGS ---
app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('doh-url', 'https://cloudflare-dns.com/dns-query');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-password-generation');
app.commandLine.appendSwitch('disable-save-password-bubble');
app.commandLine.appendSwitch('disable-single-click-autofill');
app.commandLine.appendSwitch('no-referrer-header');

// --- LOGGING ---
function systemLog(type, message) {
    console.log(`[${type}] ${message}`);
    if (blackBoxView && !blackBoxView.webContents.isDestroyed()) {
        blackBoxView.webContents.send('log-data', { type, message });
    }
}

// --- WINDOW CREATION ---
function createWindow() {
    console.log('Creating Main Window...');
    mainWindow = new BrowserWindow({
        width: 1280, height: 850, minWidth: 900, minHeight: 600,
        title: "SecureScope", backgroundColor: '#dfe3e8',
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#dfe3e8', symbolColor: '#000000', height: 42 },
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false, // Critical for require('electron') in renderer
            enableRemoteModule: true
        }
    });

    // UI Security
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: svg:;"]
            }
        });
    });

    const indexPath = path.resolve(__dirname, 'index.html');
    console.log('Loading index from:', indexPath);
    mainWindow.loadFile(indexPath);

    mainWindow.on('resize', () => {
        if (!mainWindow) return;
        const bounds = mainWindow.getBounds();
        const config = { x: 0, y: TOP_OFFSET, width: bounds.width, height: bounds.height - TOP_OFFSET };
        if (activeTabId === 'BLACKBOX' && blackBoxView) {
            blackBoxView.setBounds(config);
        } else if (activeTabId && tabs[activeTabId]) {
            tabs[activeTabId].view.setBounds(config);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        tabs = {};
        activeTabId = null;
    });

    // We no longer blindly create tabs on dom-ready.
    // We wait for 'renderer-ready' signal.
    console.log('Main Window created. Waiting for renderer signal...');
}

// --- BLACKBOX ---
function createBlackBox() {
    console.log('Creating Blackbox...');
    const ses = session.fromPartition('persist:audit-log');
    blackBoxView = new BrowserView({
        webPreferences: {
            session: ses,
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    });
    const bbPath = path.resolve(__dirname, 'blackbox.html');
    blackBoxView.webContents.loadFile(bbPath);
    tabs['BLACKBOX'] = { view: blackBoxView, title: 'AUDIT LOG' };

    if(mainWindow) mainWindow.webContents.send('blackbox-created');
    systemLog('SYSTEM', 'SecureScope Kernel v3.0 Online. Hardening: MAX.');
}

// --- TABS LOGIC ---
function createNewTab(url = 'https://www.google.com', profileKey = 'STANDARD') {
    if (!mainWindow) {
        console.error('createNewTab called but mainWindow is null');
        return;
    }

    const profile = PROFILES[profileKey] || PROFILES.STANDARD;
    const tabId = Date.now().toString();

    systemLog('SYSTEM', `Allocating Container ${tabId} [Profile: ${profile.name}]`);

    let partition = `scope-${tabId}`;
    if (profile.persistence) {
        partition = `persist:${profileKey.toLowerCase()}`;
    }

    const ses = session.fromPartition(partition, { cache: profile.persistence });

    if (profile.proxy) {
        ses.setProxy({ proxyRules: profile.proxy });
        systemLog('NET', `Tunneling via ${profile.proxy}`);
    }

    // Permissions & Security
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        systemLog('THREAT', `Blocked permission: ${permission}`);
        return callback(false);
    });
    ses.on('will-download', (event, item) => {
        event.preventDefault();
        systemLog('THREAT', `Download blocked: ${item.getFilename()}`);
    });
    ses.setCertificateVerifyProc((request, callback) => {
        if (request.errorCode) {
            systemLog('THREAT', `Invalid Cert blocked: ${request.hostname} (${request.errorCode})`);
            callback(-2);
        } else {
            callback(0);
        }
    });

    const filter = { urls: ['*://*/*'] };
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        delete details.requestHeaders['Referer'];
        delete details.requestHeaders['X-Client-Data'];
        details.requestHeaders['User-Agent'] = profile.userAgent;
        callback({ requestHeaders: details.requestHeaders });
    });
    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = details.responseHeaders;
        responseHeaders['X-Frame-Options'] = ['DENY'];
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        callback({ responseHeaders });
    });

    const finalPrefs = {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        plugins: false,
        enableWebSQL: false,
        webgl: false,
        backgroundThrottling: false,
        ...profile.webPreferences
    };

    const view = new BrowserView({ webPreferences: finalPrefs });

    view.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:' || parsedUrl.protocol === 'chrome:') {
            event.preventDefault();
            systemLog('THREAT', `Local filesystem access blocked: ${navigationUrl}`);
        }
    });

    let ttlTimer = null;
    if (profile.ttl > 0) {
        ttlTimer = setTimeout(() => {
            systemLog('SYSTEM', `TTL Expired for Container ${tabId}. Auto-destructing.`);
            closeTab(tabId);
        }, profile.ttl);
    }

    tabs[tabId] = {
        view,
        title: 'Secure Container',
        profile: profileKey,
        proxy: profile.proxy || 'Direct',
        ttl: profile.ttl,
        creationTime: Date.now(),
        timer: ttlTimer
    };

    view.webContents.on('did-navigate', (e, newUrl) => {
        systemLog('NET', `Mapsd: ${newUrl.substring(0, 40)}...`);
        if (activeTabId === tabId) mainWindow.webContents.send('update-url', newUrl);
        checkNavButtons(view);
    });

    view.webContents.on('page-title-updated', (e, title) => {
        if (tabs[tabId]) {
            tabs[tabId].title = title;
            mainWindow.webContents.send('update-tab-info', { id: tabId, title: title });
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        systemLog('THREAT', `Popup intercepted: ${url}`);
        createNewTab(url, profileKey);
        return { action: 'deny' };
    });

    view.webContents.loadURL(url).catch(err => systemLog('THREAT', `Load Fail: ${err.message}`));

    console.log(`Tab created: ${tabId}. Sending to renderer...`);
    mainWindow.webContents.send('tab-created', tabId);
    switchToTab(tabId);
}

function switchToTab(id) {
    console.log(`Switching to tab: ${id}`);
    if (!tabs[id]) {
        console.error(`Tab ${id} not found!`);
        return;
    }
    if (!mainWindow) return;

    if (activeTabId && tabs[activeTabId]) {
        mainWindow.removeBrowserView(tabs[activeTabId].view);
    }

    if (activeTabId && activeTabId !== id) {
        clipboard.clear();
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

    if (tabs[id].timer) clearTimeout(tabs[id].timer);

    const view = tabs[id].view;
    systemLog('SYSTEM', `Destroying Container ${id}. Memory scrubbed.`);
    clipboard.clear();

    const isPersistent = tabs[id].profile === 'BANKING';
    if (!isPersistent) {
        try {
            view.webContents.session.clearCache();
            view.webContents.session.clearStorageData();
            view.webContents.session.clearAuthCache();
        } catch (e) {
            console.error('Error clearing session data:', e);
        }
    }

    if (activeTabId === id) {
        mainWindow.removeBrowserView(view);
        activeTabId = null;
    }

    try {
        view.webContents.destroy();
    } catch(e) {
        console.error('Error destroying view:', e);
    }

    delete tabs[id];

    const ids = Object.keys(tabs);
    if (ids.length > 0) switchToTab(ids[ids.length - 1]);
    else switchToTab('BLACKBOX');
}

function checkNavButtons(view) {
    if (activeTabId && tabs[activeTabId] && activeTabId !== 'BLACKBOX' && mainWindow) {
        try {
            mainWindow.webContents.send('update-nav-state', {
                canGoBack: view.webContents.canGoBack(),
                canGoForward: view.webContents.canGoForward()
            });
        } catch(e) {
            console.error('Error updating nav state:', e);
        }
    }
}

// --- APP LIFECYCLE ---
app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// HANDSHAKE: Wait for renderer to be ready!
ipcMain.on('renderer-ready', () => {
    console.log('IPC: renderer-ready. Initializing tabs now.');
    if (!blackBoxView) createBlackBox();

    // Only create initial tab if none exist (to prevent duplicates on reload)
    const existingTabs = Object.keys(tabs).filter(k => k !== 'BLACKBOX');
    if (existingTabs.length === 0) {
        createNewTab('https://www.google.com');
    } else {
        // If we reloaded the renderer, re-send the tabs?
        // For now, simpler to just restore the active tab UI if it exists,
        // but `renderer.js` clears UI on reload.
        // Let's just create one new tab for simplicity or re-emit existing.
        // Ideally we'd sync state, but for this scope, a new tab is safer to ensure visibility.
        // Actually, if we reload, `tabs` variable in main persists.
        // But the renderer DOM is gone. We need to rebuild the renderer DOM.

        // Rebuild DOM for existing tabs
        if(blackBoxView) mainWindow.webContents.send('blackbox-created');
        existingTabs.forEach(tid => {
            mainWindow.webContents.send('tab-created', tid);
        });
        if(activeTabId) switchToTab(activeTabId);
    }
});

ipcMain.on('new-tab', () => {
    console.log('IPC: new-tab');
    createNewTab('https://www.google.com');
});

ipcMain.on('switch-tab', (e, id) => {
    console.log('IPC: switch-tab', id);
    switchToTab(id);
});

ipcMain.on('close-tab', (e, id) => {
    console.log('IPC: close-tab', id);
    closeTab(id);
});

ipcMain.on('navigate', (e, url) => {
    if (activeTabId && activeTabId !== 'BLACKBOX' && tabs[activeTabId]) {
        const fullUrl = url.startsWith('http') ? url : `https://${url}`;
        tabs[activeTabId].view.webContents.loadURL(fullUrl);
    }
});
ipcMain.on('go-back', () => {
    if (activeTabId !== 'BLACKBOX' && tabs[activeTabId]) tabs[activeTabId].view.webContents.goBack();
});
ipcMain.on('go-forward', () => {
    if (activeTabId !== 'BLACKBOX' && tabs[activeTabId]) tabs[activeTabId].view.webContents.goForward();
});
ipcMain.on('reload', () => {
    if (activeTabId !== 'BLACKBOX' && tabs[activeTabId]) tabs[activeTabId].view.webContents.reload();
});

ipcMain.on('create-tab-with-profile', (e, { url, profile }) => {
    console.log('IPC: create-tab-with-profile', profile);
    createNewTab(url || 'https://www.google.com', profile);
});

ipcMain.on('get-containers', (event) => {
    const data = Object.keys(tabs).map(key => {
        if (key === 'BLACKBOX') return null;
        const tab = tabs[key];
        return {
            id: key,
            title: tab.title,
            profile: tab.profile,
            proxy: tab.proxy,
            ttl: tab.ttl,
            creationTime: tab.creationTime
        };
    }).filter(x => x !== null);
    event.reply('containers-data', data);
});

ipcMain.on('regenerate-container', (e, id) => {
    const tab = tabs[id];
    if (tab) {
        const url = tab.view.webContents.getURL();
        const profile = tab.profile;
        closeTab(id);
        createNewTab(url, profile);
    }
});

ipcMain.on('get-profiles', (event) => {
    event.reply('profiles-data', Object.keys(PROFILES).map(k => ({ key: k, name: PROFILES[k].name })));
});
