const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, 'out', 'index.html'),
    protocol: 'file:',
    slashes: true
  });
  
  mainWindow.loadURL(startUrl);

  // Open DevTools for debugging
  //mainWindow.webContents.openDevTools();

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
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
  try {
    await fs.writeFile(path.join(app.getPath('userData'), 'pages.json'), JSON.stringify(pages, null, 2));
  } catch (error) {
    throw error;
  }
});

function setupAutoUpdater() {
  console.log('Setting up auto-updater...');
  log.info('Setting up auto-updater...');

  const server = 'https://github.com/Efesop/rich-text-editor';
  const url = `${server}/update/${process.platform}/${app.getVersion()}`;
  
  autoUpdater.setFeedURL({ url });

  autoUpdater.autoDownload = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    mainWindow.webContents.send('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    mainWindow.webContents.send('update-available', info);
    storeUpdateAvailability(true);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    mainWindow.webContents.send('update-not-available', info);
    storeUpdateAvailability(false);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    mainWindow.webContents.send('error', err.toString());
  });

  autoUpdater.on('download-progress', (progressObj) => {
    let logMessage = `Download speed: ${progressObj.bytesPerSecond}`;
    logMessage = `${logMessage} - Downloaded ${progressObj.percent}%`;
    logMessage = `${logMessage} (${progressObj.transferred}/${progressObj.total})`;
    log.info(logMessage);
    mainWindow.webContents.send('download-progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info);
    mainWindow.webContents.send('update-downloaded', info);
  });

  // Initial check for updates
  autoUpdater.checkForUpdates();

  // Check for updates every 2 minutes
  setInterval(() => {
    console.log('Periodic update check');
    log.info('Periodic update check');
    autoUpdater.checkForUpdates();
  }, 2 * 60 * 1000);
}

// Replace the existing 'check-for-updates' handler with this:
ipcMain.handle('check-for-updates', async () => {
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
  }
});

// Add a new handler for downloading updates
ipcMain.handle('download-update', async () => {
  try {
    log.info('Starting update download...');
    const downloadResult = await autoUpdater.downloadUpdate();
    log.info('Update downloaded successfully');
    return { success: true };
  } catch (error) {
    log.error('Error downloading update:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('install-update', () => {
  log.info('Installing update...');
  mainWindow.webContents.send('install-progress', 'Preparing to install');
  
  // Simulate installation steps (replace with actual steps if possible)
  setTimeout(() => mainWindow.webContents.send('install-progress', 'Backing up data'), 2000);
  setTimeout(() => mainWindow.webContents.send('install-progress', 'Applying update'), 4000);
  setTimeout(() => mainWindow.webContents.send('install-progress', 'Finalizing installation'), 6000);
  
  setTimeout(() => {
    mainWindow.webContents.send('install-progress', 'Update installed. Restarting...');
    autoUpdater.quitAndInstall(false, true);
  }, 8000);
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

ipcMain.handle('manual-check-for-updates', async () => {
  try {
    log.info('Manually checking for updates...');
    const result = await autoUpdater.checkForUpdates();
    const updateAvailable = result.updateInfo.version !== app.getVersion();
    log.info(`Manual update check result: ${updateAvailable ? 'Update available' : 'No update available'}`);
    return { 
      available: updateAvailable, 
      currentVersion: app.getVersion(),
      latestVersion: result.updateInfo.version 
    };
  } catch (error) {
    log.error('Error manually checking for updates:', error);
    return { available: false, error: error.message };
  }
});

console.log('Initial check for updates');
log.info('Initial check for updates');
