const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    let validChannels = ['read-pages', 'save-pages', 'read-tags', 'save-tags', 'restart-app', 'check-for-updates'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  on: (channel, func) => {
    let validChannels = ['checking-for-update', 'update-available', 'update-not-available', 'error', 'download-progress', 'update-downloaded'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  openExternal: (url) => shell.openExternal(url)
});
