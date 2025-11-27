const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    sendNavigate: (url) => ipcRenderer.send('navigate', url),
    sendSync: (channel, data) => ipcRenderer.sendSync(channel, data),
    send: (channel, data) => ipcRenderer.send(channel, data)
});
