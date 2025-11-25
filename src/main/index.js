const { app, ipcMain } = require('electron');
const { createWindow } = require('./window');
const { createBlackBox, createNewTab, switchToTab, closeTab, getContainers } = require('./tabs');
const state = require('./state');
const PROFILES = require('./profiles');

app.commandLine.appendSwitch('disable-http-cache');
app.commandLine.appendSwitch('doh-url', 'https://cloudflare-dns.com/dns-query');
app.commandLine.appendSwitch('disable-metrics');
app.commandLine.appendSwitch('disable-breakpad');
app.commandLine.appendSwitch('disable-password-generation');
app.commandLine.appendSwitch('disable-save-password-bubble');
app.commandLine.appendSwitch('disable-single-click-autofill');
app.commandLine.appendSwitch('no-referrer-header');

// IPC Handlers
ipcMain.on('new-tab', () => createNewTab('https://www.google.com'));
ipcMain.on('switch-tab', (e, id) => switchToTab(id));
ipcMain.on('close-tab', (e, id) => closeTab(id));
ipcMain.on('navigate', (e, url) => {
    if (state.activeTabId && state.activeTabId !== 'BLACKBOX') {
        state.tabs[state.activeTabId].view.webContents.loadURL(url.startsWith('http') ? url : `https://${url}`);
    }
});
ipcMain.on('go-back', () => { if (state.activeTabId !== 'BLACKBOX') state.tabs[state.activeTabId].view.webContents.goBack() });
ipcMain.on('go-forward', () => { if (state.activeTabId !== 'BLACKBOX') state.tabs[state.activeTabId].view.webContents.goForward() });
ipcMain.on('reload', () => { if (state.activeTabId !== 'BLACKBOX') state.tabs[state.activeTabId].view.webContents.reload() });

// New IPCs for Features
ipcMain.on('create-tab-with-profile', (e, { url, profile }) => {
    createNewTab(url || 'https://www.google.com', profile);
});

ipcMain.on('get-containers', (event) => {
    event.reply('containers-data', getContainers());
});

ipcMain.on('regenerate-container', (e, id) => {
    const tab = state.tabs[id];
    if (tab) {
        const url = tab.view.webContents.getURL();
        const profile = tab.profile;
        closeTab(id);
        createNewTab(url, profile);
    }
});

// Provide Profiles list to renderer
ipcMain.on('get-profiles', (event) => {
    event.reply('profiles-data', Object.keys(PROFILES).map(k => ({ key: k, name: PROFILES[k].name })));
});


app.whenReady().then(() => {
    createWindow(() => {
        createBlackBox();
        createNewTab('https://www.google.com');
    });
});

app.on('window-all-closed', () => app.quit());