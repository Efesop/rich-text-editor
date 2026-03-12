const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('electronPlatform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux'
});

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel, ...args) => {
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
      'set-github-token',
      'read-whats-new',
      'save-whats-new',
      'read-app-lock',
      'save-app-lock',
      'check-biometric-available',
      'prompt-touch-id',
      'safe-storage-store',
      'safe-storage-retrieve',
      'safe-storage-delete',
      'read-decoy-pages',
      'save-decoy-pages'
    ];

    if (validChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  
  on: (channel, func) => {
    const validChannels = [
      'checking-for-update',
      'update-available',
      'update-not-available',
      'update-error',
      'download-progress',
      'update-downloaded',
      'deep-link-share'
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
      'update-downloaded',
      'deep-link-share'
    ];
    
    if (validChannels.includes(channel)) {
      ipcRenderer.removeListener(channel, func);
    }
  },
  
  openExternal: (url) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch {}
  }
});
