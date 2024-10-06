const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Load environment variables from .env file in development
// if (process.env.NODE_ENV !== 'production') {
//   require('dotenv').config();
// }

// Configure logging
log.transports.file.level = 'debug'; // Change this to 'debug' for more detailed logs
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
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
    mainWindow.webContents.send('checking-for-update');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info);
    mainWindow.webContents.send('update-available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('Update not available:', info);
    mainWindow.webContents.send('update-not-available', info);
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater:', err);
    log.error('Error details:', err.stack);
    log.error('Current version:', app.getVersion());
    log.error('Update URL:', autoUpdater.getFeedURL());
    mainWindow.webContents.send('error', err.message);
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

  autoUpdater.checkForUpdatesAndNotify();

  // Check for updates every 30 minutes
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 30 * 60 * 1000);
}

ipcMain.handle('check-for-updates', () => {
  log.info('Manually checking for updates...');
  autoUpdater.checkForUpdates();
});

ipcMain.handle('install-update', () => {
  log.info('Installing update...');
  autoUpdater.quitAndInstall(true, true);
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  autoUpdater.checkForUpdates();
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