const { app, BrowserWindow } = require('electron');
const path = require('path');
const url = require('url');
const { ipcMain } = require('electron');
const fs = require('fs').promises;
const serve = require('electron-serve');
const loadURL = serve({ directory: 'dist' });

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

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    loadURL(mainWindow);
  }

  // Open DevTools for debugging
//  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
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

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});
