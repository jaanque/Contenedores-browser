const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    sendNavigate: (url) => ipcRenderer.send('navigate', url)
});
