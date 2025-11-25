const { BrowserView, session, clipboard } = require('electron');
const path = require('path');
const state = require('./state');
const { systemLog } = require('./logger');
const PROFILES = require('./profiles');

function createBlackBox() {
    if (!state.mainWindow) {
        console.error('Cannot create BlackBox: mainWindow is null');
        return;
    }
    const ses = session.fromPartition('persist:audit-log');
    state.blackBoxView = new BrowserView({
        webPreferences: {
            session: ses,
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    });
    const bbPath = path.resolve(__dirname, '../renderer/components/blackbox/index.html');
    console.log('Loading Blackbox from:', bbPath);
    state.blackBoxView.webContents.loadFile(bbPath);
    state.tabs['BLACKBOX'] = { view: state.blackBoxView, title: 'AUDIT LOG' };
    state.mainWindow.webContents.send('blackbox-created');
    systemLog('SYSTEM', 'SecureScope Kernel v3.0 Online. Hardening: MAX.');
}

function createNewTab(url = 'https://www.google.com', profileKey = 'STANDARD') {
    if (!state.mainWindow) {
        console.error('Cannot create New Tab: mainWindow is null');
        return;
    }

    const profile = PROFILES[profileKey] || PROFILES.STANDARD;
    const tabId = Date.now().toString();

    systemLog('SYSTEM', `Allocating Container ${tabId} [Profile: ${profile.name}]`);

    // Partition Logic
    let partition = `scope-${tabId}`;
    if (profile.persistence) {
        partition = `persist:${profileKey.toLowerCase()}`;
    }

    const ses = session.fromPartition(partition, { cache: profile.persistence });

    // Proxy
    if (profile.proxy) {
        ses.setProxy({ proxyRules: profile.proxy });
        systemLog('NET', `Tunneling via ${profile.proxy}`);
    }

    // Permissions
    ses.setPermissionRequestHandler((webContents, permission, callback) => {
        systemLog('THREAT', `Blocked permission: ${permission}`);
        return callback(false);
    });

    // Downloads
    ses.on('will-download', (event, item) => {
        event.preventDefault();
        systemLog('THREAT', `Download blocked: ${item.getFilename()}`);
    });

    // SSL
    ses.setCertificateVerifyProc((request, callback) => {
        if (request.errorCode) {
            systemLog('THREAT', `Invalid Cert blocked: ${request.hostname} (${request.errorCode})`);
            callback(-2);
        } else {
            callback(0);
        }
    });

    // Headers
    const filter = { urls: ['*://*/*'] };
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
        delete details.requestHeaders['Referer'];
        delete details.requestHeaders['X-Client-Data'];
        details.requestHeaders['User-Agent'] = profile.userAgent;
        callback({ requestHeaders: details.requestHeaders });
    });

    // CSP
    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = details.responseHeaders;
        responseHeaders['X-Frame-Options'] = ['DENY'];
        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        callback({ responseHeaders });
    });

    const defaultPrefs = {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        plugins: false,
        enableWebSQL: false,
        webgl: false,
        backgroundThrottling: false
    };

    const finalPrefs = { ...defaultPrefs, ...profile.webPreferences, session: ses };

    const view = new BrowserView({
        webPreferences: finalPrefs
    });

    view.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol === 'file:' || parsedUrl.protocol === 'chrome:') {
            event.preventDefault();
            systemLog('THREAT', `Local filesystem access blocked: ${navigationUrl}`);
        }
    });

    // TTL Logic
    let ttlTimer = null;
    if (profile.ttl > 0) {
        ttlTimer = setTimeout(() => {
            systemLog('SYSTEM', `TTL Expired for Container ${tabId}. Auto-destructing.`);
            closeTab(tabId);
        }, profile.ttl);
    }

    state.tabs[tabId] = {
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
        if (state.activeTabId === tabId) state.mainWindow.webContents.send('update-url', newUrl);
        checkNavButtons(view);
    });

    view.webContents.on('page-title-updated', (e, title) => {
        if(state.tabs[tabId]) {
            state.tabs[tabId].title = title;
            state.mainWindow.webContents.send('update-tab-info', { id: tabId, title: title });
        }
    });

    view.webContents.setWindowOpenHandler(({ url }) => {
        systemLog('THREAT', `Popup intercepted: ${url}`);
        createNewTab(url, profileKey);
        return { action: 'deny' };
    });

    view.webContents.loadURL(url).catch(err => systemLog('THREAT', `Load Fail: ${err.message}`));

    state.mainWindow.webContents.send('tab-created', tabId);
    switchToTab(tabId);
}

function switchToTab(id) {
    if (!state.mainWindow) return;
    if (!state.tabs[id]) return;

    if (state.activeTabId && state.tabs[state.activeTabId]) {
        state.mainWindow.removeBrowserView(state.tabs[state.activeTabId].view);
    }

    if (state.activeTabId && state.activeTabId !== id) {
        clipboard.clear();
    }

    state.activeTabId = id;
    const currentView = state.tabs[id].view;
    state.mainWindow.addBrowserView(currentView);

    const bounds = state.mainWindow.getBounds();
    currentView.setBounds({ x: 0, y: state.TOP_OFFSET, width: bounds.width, height: bounds.height - state.TOP_OFFSET });

    if (id === 'BLACKBOX') {
        state.mainWindow.webContents.send('update-url', 'secure://audit-log');
        state.mainWindow.webContents.send('update-nav-state', { canGoBack: false, canGoForward: false });
    } else {
        state.mainWindow.webContents.send('update-url', currentView.webContents.getURL());
        checkNavButtons(currentView);
    }
    state.mainWindow.webContents.send('tab-active', id);
}

function closeTab(id) {
    if (id === 'BLACKBOX') return;
    if (!state.tabs[id]) return;

    // Clear Timer
    if (state.tabs[id].timer) {
        clearTimeout(state.tabs[id].timer);
    }

    const view = state.tabs[id].view;

    systemLog('SYSTEM', `Destroying Container ${id}. Memory scrubbed.`);

    clipboard.clear();

    const isPersistent = state.tabs[id].profile === 'BANKING';

    if (!isPersistent) {
        view.webContents.session.clearCache();
        view.webContents.session.clearStorageData();
        view.webContents.session.clearAuthCache();
    } else {
        systemLog('SYSTEM', `Persisting state for Container ${id}.`);
    }

    if (state.activeTabId === id) {
        if(state.mainWindow) state.mainWindow.removeBrowserView(view);
        state.activeTabId = null;
    }
    view.webContents.destroy();
    delete state.tabs[id];

    const ids = Object.keys(state.tabs);
    if (ids.length > 0) switchToTab(ids[ids.length - 1]);
    else switchToTab('BLACKBOX');
}

function checkNavButtons(view) {
    if (state.activeTabId && state.tabs[state.activeTabId] && state.activeTabId !== 'BLACKBOX') {
        state.mainWindow.webContents.send('update-nav-state', {
            canGoBack: view.webContents.canGoBack(),
            canGoForward: view.webContents.canGoForward()
        });
    }
}

function getContainers() {
    return Object.keys(state.tabs).map(key => {
        if (key === 'BLACKBOX') return null;
        const tab = state.tabs[key];
        return {
            id: key,
            title: tab.title,
            profile: tab.profile,
            proxy: tab.proxy,
            ttl: tab.ttl,
            creationTime: tab.creationTime
        };
    }).filter(x => x !== null);
}

module.exports = { createBlackBox, createNewTab, switchToTab, closeTab, getContainers };