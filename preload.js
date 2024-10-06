const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    let validChannels = ['read-pages', 'save-pages', 'read-tags', 'save-tags', 'restart-app', 'check-for-updates', 'download-update', 'install-update'];
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data).catch(error => {
        console.error(`Error in channel ${channel}:`, error);
        throw error;
      });
    }
  },
  on: (channel, func) => {
    let validChannels = ['checking-for-update', 'update-available', 'update-not-available', 'error', 'download-progress', 'update-downloaded', 'install-progress'];
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  removeListener: (channel, func) => {
    let validChannels = ['checking-for-update', 'update-available', 'update-not-available', 'error', 'download-progress', 'update-downloaded', 'install-progress'];
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },
  openExternal: (url) => shell.openExternal(url)
});
