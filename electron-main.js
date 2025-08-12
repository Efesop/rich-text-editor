const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
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
          "img-src 'self' data: https:; " +
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

  // Security: Prevent new window creation and redirect to external browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });

  // Security: Block navigation to external sites
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl)
    
    if (parsedUrl.origin !== startUrl && !navigationUrl.startsWith('file://')) {
      event.preventDefault()
      require('electron').shell.openExternal(navigationUrl)
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
      // Fix corrupted content automatically (fallback safety check)
      if (!page.content || typeof page.content !== 'object') {
        page.content = {
          time: Date.now(),
          blocks: [],
          version: '2.30.6'
        };
      }

      return {
        id: page.id,
        title: page.title.slice(0, 200), // Limit title length
        content: {
          time: page.content.time || Date.now(),
          blocks: Array.isArray(page.content.blocks) ? page.content.blocks : [],
          version: page.content.version || '2.30.6'
        },
        tags: Array.isArray(page.tags) ? page.tags : [],
        tagNames: Array.isArray(page.tagNames) ? page.tagNames : [],
        createdAt: page.createdAt || new Date().toISOString(),
        password: page.password || null,
        folderId: page.folderId || null,
        type: page.type || undefined
      };
    });

    await fs.writeFile(path.join(app.getPath('userData'), 'pages.json'), JSON.stringify(sanitizedPages, null, 2));
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
    // Rate limiting for manual checks
    if (isManual) {
      const now = Date.now()
      if (now - this.lastCheckTime < this.minCheckInterval) {
        const waitTime = Math.ceil((this.minCheckInterval - (now - this.lastCheckTime)) / 1000)
        return {
          available: false,
          error: `Please wait ${waitTime} seconds before checking again`,
          rateLimited: true,
          canRetry: true,
          waitTime: waitTime
        }
      }
      this.lastCheckTime = now
    }

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

      const updateAvailable = result.updateInfo.version !== app.getVersion()
      
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

  // Periodic checks every 30 minutes
  setInterval(() => {
    if (!updateManager.isCheckingForUpdates && !updateManager.isDownloading) {
      log.info('Periodic update check')
      updateManager.checkForUpdates(false)
    }
  }, 30 * 60 * 1000)
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
  log.info('App is ready, creating window...');
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
