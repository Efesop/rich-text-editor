const { app, BrowserWindow, dialog, systemPreferences, safeStorage } = require('electron');
const path = require('path');
const url = require('url');
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Check if app should be moved to Applications folder (macOS only)
function checkApplicationsFolder() {
  // Only check on macOS and when app is packed (not in development)
  if (process.platform !== 'darwin' || !app.isPackaged) {
    return true;
  }

  // Check if already in Applications folder
  if (app.isInApplicationsFolder()) {
    return true;
  }

  // Show dialog asking user to move the app
  const choice = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['Move to Applications', 'Not Now'],
    defaultId: 0,
    cancelId: 1,
    title: 'Move to Applications Folder',
    message: 'Dash needs to be in the Applications folder to receive updates.',
    detail: 'To enable automatic updates, Dash needs to be moved to your Applications folder. Would you like to move it now?\n\nIf you choose "Not Now", you can manually drag Dash to your Applications folder later.'
  });

  if (choice === 0) {
    try {
      // This will move the app and restart it
      const moved = app.moveToApplicationsFolder({
        conflictHandler: (conflictType) => {
          if (conflictType === 'existsAndRunning') {
            dialog.showMessageBoxSync({
              type: 'error',
              title: 'Cannot Move',
              message: 'Another instance of Dash is running from the Applications folder.',
              detail: 'Please close it and try again.'
            });
            return false;
          }
          // 'exists' - replace the existing app
          return true;
        }
      });

      if (!moved) {
        log.info('User cancelled move to Applications folder');
      }
      return moved;
    } catch (error) {
      log.error('Failed to move to Applications folder:', error);
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'Move Failed',
        message: 'Could not move Dash to Applications folder.',
        detail: `Please manually drag Dash to your Applications folder.\n\nError: ${error.message}`
      });
      return false;
    }
  }

  // User chose "Not Now" - continue anyway but they won't get updates
  log.info('User declined to move to Applications folder');
  return true;
}

// Rate limiting for security
const rateLimiter = new Map();
const SAVE_LIMIT = 100; // saves per minute
const RATE_WINDOW = 60 * 1000; // 1 minute

function checkRateLimit(key) {
  const now = Date.now();
  const windowStart = now - RATE_WINDOW;

  if (!rateLimiter.has(key)) {
    rateLimiter.set(key, []);
  }

  const requests = rateLimiter.get(key);
  // Remove old requests outside the window
  const validRequests = requests.filter(time => time > windowStart);

  if (validRequests.length >= SAVE_LIMIT) {
    return false; // Rate limit exceeded
  }

  validRequests.push(now);
  rateLimiter.set(key, validRequests);
  return true;
}

// Load environment variables from .env file
require('dotenv').config();

// Configure logging
log.transports.file.level = 'info'; // Change this to 'debug' for more detailed logs
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let mainWindow;

function createWindow() {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true, // Enable sandbox for security
      enableRemoteModule: false,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      preload: path.join(__dirname, 'preload.js')
    },
    show: false // Don't show until ready
  });

  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, 'out', 'index.html'),
    protocol: 'file:',
    slashes: true
  });

  // Security: Set CSP headers
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data:; " +
          "font-src 'self' data:; " +
          "connect-src 'self'; " +
          "frame-src 'none'; " +
          "object-src 'none';"
        ]
      }
    })
  })

  mainWindow.loadURL(startUrl);

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Open DevTools for debugging
  //mainWindow.webContents.openDevTools();

  // Security: Only allow http/https URLs to be opened externally
  const isSafeUrl = (url) => {
    try {
      const parsed = new URL(url)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch { return false }
  }

  // Security: Prevent new window creation and redirect to external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeUrl(url)) {
      require('electron').shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Security: Block navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsedUrl = new URL(navigationUrl)
      if (parsedUrl.origin !== startUrl && !navigationUrl.startsWith('file://')) {
        event.preventDefault()
        if (isSafeUrl(navigationUrl)) {
          require('electron').shell.openExternal(navigationUrl)
        }
      }
    } catch {
      event.preventDefault()
    }
  });
}

const tagsPath = path.join(app.getPath('userData'), 'tags.json');

ipcMain.handle('read-tags', async () => {
  try {
    const data = await fs.readFile(tagsPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return an empty array
      return [];
    }
    throw error;
  }
});

ipcMain.handle('save-tags', async (event, tags) => {
  try {
    await fs.writeFile(tagsPath, JSON.stringify(tags, null, 2));
  } catch (error) {
    throw error;
  }
});

// What's New modal persistence
const whatsNewPath = path.join(app.getPath('userData'), 'whats-new.json');

ipcMain.handle('read-whats-new', async () => {
  try {
    const data = await fs.readFile(whatsNewPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
});

ipcMain.handle('save-whats-new', async (event, data) => {
  try {
    await fs.writeFile(whatsNewPath, JSON.stringify(data, null, 2));
  } catch (error) {
    throw error;
  }
});

// App Lock persistence
const appLockPath = path.join(app.getPath('userData'), 'app-lock.json');

ipcMain.handle('read-app-lock', async () => {
  try {
    const data = await fs.readFile(appLockPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
});

ipcMain.handle('save-app-lock', async (event, data) => {
  try {
    await fs.writeFile(appLockPath, JSON.stringify(data, null, 2));
  } catch (error) {
    throw error;
  }
});

// Biometric authentication (Touch ID on macOS)
ipcMain.handle('check-biometric-available', async () => {
  try {
    if (process.platform === 'darwin' && systemPreferences.canPromptTouchID()) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

ipcMain.handle('prompt-touch-id', async () => {
  try {
    if (process.platform === 'darwin') {
      await systemPreferences.promptTouchID('unlock Dash');
      return true;
    }
    return false;
  } catch {
    return false;
  }
});

// Secure storage for biometric encryption key (uses OS keychain)
const isSafeStorageKey = (key) => typeof key === 'string' && /^[a-zA-Z0-9-]+$/.test(key);

ipcMain.handle('safe-storage-store', async (event, key, plaintext) => {
  try {
    if (!isSafeStorageKey(key)) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;
    const encrypted = safeStorage.encryptString(plaintext);
    const filePath = path.join(app.getPath('userData'), `safe-${key}.enc`);
    await fs.writeFile(filePath, encrypted);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('safe-storage-retrieve', async (event, key) => {
  try {
    if (!isSafeStorageKey(key)) return null;
    if (!safeStorage.isEncryptionAvailable()) return null;
    const filePath = path.join(app.getPath('userData'), `safe-${key}.enc`);
    const encrypted = await fs.readFile(filePath);
    return safeStorage.decryptString(encrypted);
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    return null;
  }
});

ipcMain.handle('safe-storage-delete', async (event, key) => {
  try {
    if (!isSafeStorageKey(key)) return true;
    const filePath = path.join(app.getPath('userData'), `safe-${key}.enc`);
    await fs.unlink(filePath);
  } catch {}
  return true;
});

ipcMain.handle('read-pages', async () => {
  try {
    const data = await fs.readFile(path.join(app.getPath('userData'), 'pages.json'), 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist, return an empty array
      return [];
    }
    throw error;
  }
});

ipcMain.handle('save-pages', async (event, pages) => {
  // Note: Rate limiting removed for save-pages as it has its own debouncing in the frontend

  try {
    // Validate data structure before saving
    if (!Array.isArray(pages)) {
      throw new Error('Invalid data: pages must be an array');
    }

    // Sanitize and validate each page
    const sanitizedPages = pages.map((page, index) => {
      if (!page.id || typeof page.id !== 'string') {
        log.error(`Page ${index}: Invalid or missing ID`, { page: { id: page.id, title: page.title } });
        throw new Error('Invalid page: missing or invalid id');
      }
      if (!page.title || typeof page.title !== 'string') {
        log.error(`Page ${index}: Invalid or missing title`, { page: { id: page.id, title: page.title } });
        throw new Error('Invalid page: missing or invalid title');
      }

      // Handle folders differently from pages
      if (page.type === 'folder') {
        return {
          id: page.id,
          title: page.title.slice(0, 200),
          type: 'folder',
          pages: Array.isArray(page.pages) ? page.pages : [],
          createdAt: page.createdAt || new Date().toISOString()
        };
      }

      // Encrypted pages have content: null and encryptedContent: {...}
      // Don't force a fallback content object when encrypted content exists
      const hasEncryptedContent = page.encryptedContent && typeof page.encryptedContent === 'object'
      const content = hasEncryptedContent
        ? null
        : (page.content && typeof page.content === 'object')
          ? page.content
          : { time: Date.now(), blocks: [], version: '2.30.6' };

      return {
        id: page.id,
        title: page.title.slice(0, 200), // Limit title length
        content: content
          ? {
              time: content.time || Date.now(),
              blocks: Array.isArray(content.blocks) ? content.blocks : [],
              version: content.version || '2.30.6'
            }
          : null,
        encryptedContent: hasEncryptedContent ? page.encryptedContent : null,
        appLockEncrypted: hasEncryptedContent ? !!page.appLockEncrypted : false,
        tags: Array.isArray(page.tags) ? page.tags : [],
        tagNames: Array.isArray(page.tagNames) ? page.tagNames : [],
        createdAt: page.createdAt || new Date().toISOString(),
        password: page.password || null,
        folderId: page.folderId || null,
        type: page.type || undefined,
        selfDestructAt: page.selfDestructAt || null
      };
    });

    const pagesPath = path.join(app.getPath('userData'), 'pages.json');
    const tempPath = pagesPath + '.tmp';
    const backupPath = pagesPath + '.bak';
    const data = JSON.stringify(sanitizedPages, null, 2);

    // Atomic write: write to temp file, backup existing, then rename
    await fs.writeFile(tempPath, data);
    try { await fs.copyFile(pagesPath, backupPath); } catch { /* no existing file to backup */ }
    await fs.rename(tempPath, pagesPath);

    return { success: true };
  } catch (error) {
    console.error('Error saving pages:', error);
    throw error;
  }
});

// Update system state management
class UpdateManager {
  constructor() {
    this.isCheckingForUpdates = false
    this.isDownloading = false
    this.isInstalling = false
    this.lastUpdateCheck = null
    this.updateInfo = null
    this.retryCount = 0
    this.maxRetries = 3
    this.lastCheckTime = 0
    this.minCheckInterval = 30 * 1000 // 30 seconds between manual checks
  }

  async checkForUpdates(isManual = false) {
    // No rate limiting - users can check as often as they want

    if (this.isCheckingForUpdates) {
      return { inProgress: true }
    }

    this.isCheckingForUpdates = true
    try {
      log.info('Checking for updates...', { manual: isManual })

      const result = await autoUpdater.checkForUpdates()

      if (!result?.updateInfo) {
        throw new Error('No update information available')
      }

      // Semantic version comparison - simple string comparison should work for most cases
      // but let's be explicit about version comparison
      const currentVersion = app.getVersion()
      const latestVersion = result.updateInfo.version
      const updateAvailable = latestVersion !== currentVersion

      log.info('Version comparison:', { currentVersion, latestVersion, updateAvailable })

      this.updateInfo = {
        available: updateAvailable,
        currentVersion: app.getVersion(),
        latestVersion: result.updateInfo.version,
        releaseNotes: result.updateInfo.releaseNotes,
        releaseDate: result.updateInfo.releaseDate
      }

      this.lastUpdateCheck = new Date().toISOString()
      this.retryCount = 0 // Reset retry count on success

      log.info('Update check completed', this.updateInfo)
      return this.updateInfo

    } catch (error) {
      log.error('Update check failed', { error: error.message, retryCount: this.retryCount })

      // Handle development mode - silently return for auto checks
      if (error.message.includes('application is not packed')) {
        return {
          available: false,
          error: isManual ? 'Updates are not available in development mode.' : null,
          isDevelopment: true,
          canRetry: false
        }
      }

      // Handle network errors gracefully
      if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        return {
          available: false,
          error: 'Unable to check for updates. Please check your internet connection.',
          offline: true,
          canRetry: true
        }
      }

      // Handle timeout errors specifically
      if (error.message.includes('ERR_TIMED_OUT') || error.message.includes('timeout')) {
        return {
          available: false,
          error: 'Update check timed out. This may happen with slow internet connections. Please try again.',
          timeout: true,
          canRetry: true
        }
      }

      // Handle 404 errors for missing latest-mac.yml (common GitHub releases issue)
      if (error.message.includes('Cannot find latest-mac.yml') || error.message.includes('404')) {
        log.info('GitHub release missing latest-mac.yml, this is normal for some releases');
        return {
          available: false,
          error: null, // Don't show error to user for this common issue
          githubIssue: true,
          canRetry: false
        }
      }

      return {
        available: false,
        error: error.message,
        canRetry: this.retryCount < this.maxRetries
      }
    } finally {
      this.isCheckingForUpdates = false
    }
  }

  async downloadUpdate() {
    if (this.isDownloading || !this.updateInfo?.available) {
      return { inProgress: this.isDownloading }
    }

    this.isDownloading = true
    try {
      log.info('Starting update download...')
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      log.error('Update download failed', { error: error.message })
      this.isDownloading = false

      // Handle specific error types
      if (error.message.includes('ERR_HTTP2_PROTOCOL_ERROR')) {
        throw new Error('Download failed due to network protocol error. This is usually a temporary GitHub server issue. Please try again in a few minutes.')
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
        throw new Error('Download failed due to network connectivity. Please check your internet connection and try again.')
      } else if (error.message.includes('timeout')) {
        throw new Error('Download timed out. Please check your internet connection and try again.')
      }

      throw error
    }
  }

  installUpdate() {
    if (this.isInstalling) return

    this.isInstalling = true
    log.info('Installing update...')
    autoUpdater.quitAndInstall()
  }

  getStatus() {
    return {
      isCheckingForUpdates: this.isCheckingForUpdates,
      isDownloading: this.isDownloading,
      isInstalling: this.isInstalling,
      lastUpdateCheck: this.lastUpdateCheck,
      updateInfo: this.updateInfo
    }
  }
}

const updateManager = new UpdateManager()

function setupAutoUpdater() {
  log.info('Setting up auto-updater...')

  // Configure auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  // Configure network settings to prevent protocol errors
  autoUpdater.requestHeaders = {
    'Cache-Control': 'no-cache',
    'User-Agent': 'Dash-Electron-App'
  }

  // Configure HTTP executor to prevent HTTP2 protocol errors
  if (autoUpdater.httpExecutor) {
    autoUpdater.httpExecutor.maxRetryAttempts = 3
    // Configure to use HTTP/1.1 instead of HTTP/2
    autoUpdater.httpExecutor.maxRedirects = 10
  }

  // Set download timeout
  autoUpdater.requestTimeout = 60000 // 60 seconds

  // Remove any existing listeners to prevent duplicates
  autoUpdater.removeAllListeners()

  // Set up event handlers
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...')
    if (mainWindow) {
      mainWindow.webContents.send('checking-for-update')
    }
  })

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info)
    updateManager.isCheckingForUpdates = false // IMPORTANT: Stop the checking state
    updateManager.updateInfo = {
      available: true,
      currentVersion: app.getVersion(),
      latestVersion: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-available', updateManager.updateInfo)
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info)
    updateManager.isCheckingForUpdates = false // IMPORTANT: Stop the checking state
    updateManager.updateInfo = {
      available: false,
      currentVersion: app.getVersion(),
      latestVersion: info.version
    }

    if (mainWindow) {
      mainWindow.webContents.send('update-not-available', updateManager.updateInfo)
    }
  })

  autoUpdater.on('error', (error) => {
    log.error('AutoUpdater error:', error)
    updateManager.isCheckingForUpdates = false
    updateManager.isDownloading = false

    if (mainWindow) {
      mainWindow.webContents.send('update-error', {
        message: error.message,
        canRetry: updateManager.retryCount < updateManager.maxRetries
      })
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    log.info('Download progress:', progressObj.percent.toFixed(2))
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj)
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info)
    updateManager.isDownloading = false

    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info)
    }
  })

  // Initial update check
  setTimeout(() => {
    updateManager.checkForUpdates(false)
  }, 3000) // Wait 3 seconds after app start

  // Periodic checks every 2 hours - reasonable for production (was 30 seconds for testing)
  setInterval(() => {
    if (!updateManager.isCheckingForUpdates && !updateManager.isDownloading) {
      log.info('Periodic background update check')
      updateManager.checkForUpdates(false) // Silent background check
    }
  }, 2 * 60 * 60 * 1000) // 2 hours
}

// IPC Handlers
ipcMain.handle('check-for-updates', async () => {
  return await updateManager.checkForUpdates(true)
})

ipcMain.handle('download-update', async () => {
  return await updateManager.downloadUpdate()
})

ipcMain.handle('install-update', () => {
  updateManager.installUpdate()
})

ipcMain.handle('get-update-status', () => {
  return updateManager.getStatus()
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

app.whenReady().then(() => {
  log.info('App is ready, checking Applications folder...');

  // Check if app needs to be moved to Applications folder (macOS)
  // This must be called before creating windows
  if (!checkApplicationsFolder()) {
    // If move was initiated, app will restart - don't continue
    return;
  }

  log.info('Creating window...');
  createWindow();
  log.info('Setting up auto-updater...');
  setupAutoUpdater();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// GitHub issue creation functionality
async function createGitHubIssue(report) {
  try {
    const { Octokit } = await import('@octokit/rest');
    const token = app.config?.get('githubToken');
    if (!token) {
      throw new Error('GitHub token not found');
    }
    const octokit = new Octokit({
      auth: token
    });

    const response = await octokit.issues.create({
      owner: 'Efesop',
      repo: 'rich-text-editor',
      title: `[${report.type.toUpperCase()}] ${report.title}`,
      body: report.description
    });
    return { success: true, issue: response.data };
  } catch (error) {
    console.error('Error creating GitHub issue:', error);
    return { success: false, error: error.message };
  }
}

ipcMain.handle('create-github-issue', async (event, report) => {
  return await createGitHubIssue(report);
});

ipcMain.handle('set-github-token', async (event, token) => {
  if (app.config) {
    app.config.set('githubToken', token);
  }
});

// Graceful shutdown handling
app.on('will-quit', (event) => {
  if (updateManager.isCheckingForUpdates || updateManager.isDownloading || updateManager.isInstalling) {
    log.info('Update operation in progress, allowing graceful quit');
  } else {
    log.info('App quitting normally');
  }
});

