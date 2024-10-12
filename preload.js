const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    let validChannels = ['read-pages', 'save-pages', 'read-tags', 'save-tags', 'check-for-updates', 'download-update', 'install-update', 'store-update-availability', 'get-app-version', 'get-last-update-check', 'manual-check-for-updates'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  on: (channel, func) => {
    let validChannels = ['checking-for-update', 'update-available', 'update-not-available', 'error', 'download-progress', 'update-downloaded', 'install-progress', 'get-last-update-check', 'manual-check-for-updates'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  removeListener: (channel, func) => {
    let validChannels = ['checking-for-update', 'update-available', 'update-not-available', 'error', 'download-progress', 'update-downloaded', 'install-progress', 'get-last-update-check', 'manual-check-for-updates'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },
  openExternal: (url) => shell.openExternal(url)
});
