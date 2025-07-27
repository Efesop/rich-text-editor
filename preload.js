const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, data) => {
    const validChannels = [
      'read-pages', 
      'save-pages', 
      'read-tags', 
      'save-tags', 
      'check-for-updates', 
      'download-update', 
      'install-update', 
      'get-update-status',
      'get-app-version', 
      'create-github-issue',
      'set-github-token'
    ];
    
    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, data);
    }
  },
  
  on: (channel, func) => {
    const validChannels = [
      'checking-for-update',
      'update-available', 
      'update-not-available', 
      'update-error',
      'download-progress', 
      'update-downloaded'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  },
  
  removeListener: (channel, func) => {
    const validChannels = [
      'checking-for-update',
      'update-available', 
      'update-not-available', 
      'update-error',
      'download-progress', 
      'update-downloaded'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },
  
  openExternal: (url) => shell.openExternal(url)
});
