const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('./state');

function createWindow(onReady) {
    state.mainWindow = new BrowserWindow({
        width: 1280, height: 850, minWidth: 900, minHeight: 600,
        title: "SecureScope", backgroundColor: '#dfe3e8',
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#dfe3e8', symbolColor: '#000000', height: 42 },
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false // Important for require('electron') in renderer
        }
    });

    state.mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' data:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: svg:;"]
            }
        });
    });

    const uiPath = path.resolve(__dirname, '../renderer/components/browser/index.html');
    console.log('Loading UI from:', uiPath);
    state.mainWindow.loadFile(uiPath);

    state.mainWindow.on('resize', () => {
        const bounds = state.mainWindow.getBounds();
        const config = { x: 0, y: state.TOP_OFFSET, width: bounds.width, height: bounds.height - state.TOP_OFFSET };
        if (state.activeTabId === 'BLACKBOX' && state.blackBoxView) {
            state.blackBoxView.setBounds(config);
        } else if (state.activeTabId && state.tabs[state.activeTabId]) {
            state.tabs[state.activeTabId].view.setBounds(config);
        }
    });

    state.mainWindow.webContents.once('dom-ready', onReady);
}

module.exports = { createWindow };