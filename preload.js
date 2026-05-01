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
      'delete-pages-backup',
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
      'lock-record-attempt',
      'lock-get-attempts',
      'check-biometric-available',
      'prompt-touch-id',
      'safe-storage-store',
      'safe-storage-retrieve',
      'safe-storage-delete',
      'read-decoy-pages',
      'save-decoy-pages',
      'save-attachment',
      'load-attachment',
      'delete-attachment',
      'open-attachment',
      'read-versions',
      'save-versions',
      'delete-versions',
      'read-vault',
      'save-vault',
      'clear-vault',
      'read-sync-queue',
      'save-sync-queue',
      'clear-sync-queue',
      'vault-key-store',
      'vault-key-retrieve',
      'vault-key-delete',
      'read-backup-settings',
      'save-backup-settings',
      'pick-backup-folder',
      'write-backup-file',
      'list-backup-files',
      'delete-backup-file',
      'get-default-backup-folder'
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
      'deep-link-share',
      'deep-link-live'
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
      'deep-link-share',
      'deep-link-live'
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
