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

// Log the token availability (be careful with this in production!)
// log.info('GH_TOKEN available:', !!token);

// Configure auto-updater
// autoUpdater.setFeedURL({
//   provider: 'github',
//   owner: 'Efesop',
//   repo: 'rich-text-editor',
//   private: true,
//   token: process.env.GH_TOKEN
// });

let mainWindow;
let isUpdating = false; // Add this line at the top level of the file

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
  // Rate limiting check
  if (!checkRateLimit('save-pages')) {
    throw new Error('Rate limit exceeded. Too many save requests.');
  }

  try {
    // Validate data structure before saving
    if (!Array.isArray(pages)) {
      throw new Error('Invalid data: pages must be an array');
    }

    // Sanitize and validate each page
    const sanitizedPages = pages.map(page => {
      if (!page.id || typeof page.id !== 'string') {
        throw new Error('Invalid page: missing or invalid id');
      }
      if (!page.title || typeof page.title !== 'string') {
        throw new Error('Invalid page: missing or invalid title');
      }
      if (!page.content || typeof page.content !== 'object') {
        throw new Error('Invalid page: missing or invalid content');
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

function setupAutoUpdater() {
  console.log('Setting up auto-updater...');
  log.info('Setting up auto-updater...');

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  // Remove existing listeners before adding new ones
  autoUpdater.removeAllListeners('update-available');
  autoUpdater.removeAllListeners('error');

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    // Don't send a notification to the renderer process
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow) {
      mainWindow.webContents.send('download-progress', progressObj)
    }
  });

  // Initial check for updates
  autoUpdater.checkForUpdates();

  // Check for updates every 30 minutes
  setInterval(() => {
    console.log('Periodic update check');
    log.info('Periodic update check');
    autoUpdater.checkForUpdates();
  }, 30 * 60 * 1000);
}

let updateCheckInProgress = false;
let downloadInProgress = false;

ipcMain.handle('check-for-updates', async () => {
  if (updateCheckInProgress) {
    return { inProgress: true };
  }

  updateCheckInProgress = true;
  try {
    console.log('Manual check for updates initiated');
    log.info('Manual check for updates initiated');
    
    const result = await autoUpdater.checkForUpdates();
    console.log('Update check result:', result);
    log.info('Update check result:', result);

    if (!result || !result.updateInfo) {
      console.log('No update info available');
      log.info('No update info available');
      return { 
        available: false, 
        currentVersion: app.getVersion(),
        latestVersion: null,
        error: 'No update info available'
      };
    }

    const updateAvailable = result.updateInfo.version !== app.getVersion();
    console.log(`Update available: ${updateAvailable}, Current version: ${app.getVersion()}, Latest version: ${result.updateInfo.version}`);
    log.info(`Update available: ${updateAvailable}, Current version: ${app.getVersion()}, Latest version: ${result.updateInfo.version}`);

    return { 
      available: updateAvailable, 
      currentVersion: app.getVersion(),
      latestVersion: result.updateInfo.version 
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    log.error('Error checking for updates:', error);
    return { available: false, error: error.message };
  } finally {
    updateCheckInProgress = false;
  }
});

ipcMain.handle('download-update', async () => {
  if (!isUpdating) {
    isUpdating = true;
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error('Error downloading update:', error);
      log.error('Error downloading update:', error);
    } finally {
      isUpdating = false;
    }
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});

ipcMain.handle('manual-check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    
    if (!result || !result.updateInfo) {
      return { 
        available: false, 
        currentVersion: app.getVersion(),
        latestVersion: null,
        error: 'No update info available'
      };
    }
    
    return { 
      available: result.updateInfo.version !== app.getVersion(),
      currentVersion: app.getVersion(),
      latestVersion: result.updateInfo.version 
    };
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { available: false, error: error.message };
  }
});

app.whenReady().then(() => {
  log.info('App is ready, creating window...');
  createWindow();
  log.info('Setting up auto-updater...');
  setupAutoUpdater();
  log.info('Checking for updates...');
  autoUpdater.checkForUpdates();
  console.log('Initial update check on app ready');
  log.info('Initial update check on app ready');
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

// Check for updates
app.on('ready', () => {
  autoUpdater.checkForUpdatesAndNotify().catch(error => {
    log.error('Error checking for updates:', error);
  });
});

// Add error listener
autoUpdater.on('error', (error) => {
  log.error('AutoUpdater error:', error);
});

function storeUpdateAvailability(available) {
  const updateFile = path.join(app.getPath('userData'), 'update-available.json');
  fs.writeFileSync(updateFile, JSON.stringify({ available }));
}

ipcMain.handle('store-update-availability', async (event, available) => {
  storeUpdateAvailability(available);
});

// Move the Octokit initialization and GitHub issue creation to a separate async function
async function createGitHubIssue(report) {
  try {
    const { Octokit } = await import('@octokit/rest');
    const token = app.config.get('githubToken');
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

// Update the IPC handler to use the new async function
ipcMain.handle('create-github-issue', async (event, report) => {
  return await createGitHubIssue(report);
});

ipcMain.handle('set-github-token', async (event, token) => {
  app.config.set('githubToken', token);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

let lastUpdateCheckResult = null;

autoUpdater.on('update-available', (info) => {
  lastUpdateCheckResult = { available: true, info };
  mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
  lastUpdateCheckResult = { available: false, info };
  mainWindow.webContents.send('update-not-available', info);
});

ipcMain.handle('get-last-update-check', () => {
  return lastUpdateCheckResult;
});

console.log('Initial check for updates');
log.info('Initial check for updates');

app.on('will-quit', (event) => {
  if (updateCheckInProgress || downloadInProgress) {
    log.info('Update is in progress, allowing quit for update installation');
  } else {
    log.info('No update in progress, quitting normally');
    // Remove the following two lines:
    // event.preventDefault();
    // app.relaunch();
  }
});

let updateAvailable = null;

autoUpdater.on('update-available', (info) => {
  updateAvailable = info;
  mainWindow.webContents.send('update-available', info);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow.webContents.send('update-downloaded');
});

/*if (!ipcMain.listenerCount('download-update')) {
  ipcMain.handle('download-update', () => {
    if (updateAvailable) {
      autoUpdater.downloadUpdate();
    }
  });
}*/
