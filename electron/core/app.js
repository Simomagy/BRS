const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let renderManager = null;
let systemMonitor = null;
let mobileCompanionServer = null;

// Determina se siamo in modalità sviluppo
const isDevelopment = app.isPackaged === false;

/**
 * Create the main application window
 */
function createMainWindow(dependencies) {
  // Store dependencies for use in window event handlers
  renderManager = dependencies.renderManager;
  systemMonitor = dependencies.systemMonitor;
  mobileCompanionServer = dependencies.mobileCompanionServer;

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 850,
    minWidth: 1440,
    minHeight: 850,
    icon: path.join(__dirname, '../../public/app_icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload.js'),
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: true
    },
    backgroundColor: '#131211',
    autoHideMenuBar: true,
  });

  // Abilita il drag and drop dei file
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });

  // Carica l'app in base all'ambiente
  if (isDevelopment) {
    mainWindow.loadURL('http://localhost:3000');
    // mainWindow.webContents.openDevTools();
  } else {
    // In produzione, carica i file statici
    const indexPath = path.join(__dirname, '../../out/index.html');

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      console.error('File index.html non trovato in:', indexPath);
      mainWindow.loadURL('about:blank');
    }
  }

  // Handle window close event with render check
  mainWindow.on('close', async (event) => {
    // Check if there are any active renders
    if (renderManager && renderManager.hasActiveRenders()) {
      // Prevent the default close action
      event.preventDefault();

      // Send message to renderer to show the custom alert dialog
      mainWindow.webContents.send('show-close-warning');
    }
    // If no active renders, allow normal close
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Get the main window instance
 */
function getMainWindow() {
  return mainWindow;
}

/**
 * Initialize app lifecycle handlers
 */
function initializeAppLifecycle(dependencies) {
  renderManager = dependencies.renderManager;
  systemMonitor = dependencies.systemMonitor;
  mobileCompanionServer = dependencies.mobileCompanionServer;

  app.whenReady().then(() => {
    const window = createMainWindow(dependencies);

    // Initialize system monitor with the window
    if (systemMonitor) {
      systemMonitor.initialize(window);
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (mainWindow === null) {
      createMainWindow(dependencies);
    }
  });

  // Critical: Handle app quit events to ensure all Blender processes are terminated
  app.on('before-quit', async (event) => {
    console.log('App before-quit event triggered');

    // Prevent immediate quit to allow cleanup
    event.preventDefault();

    try {
      // Stop all active Blender processes
      if (renderManager && renderManager.hasActiveRenders()) {
        console.log('Terminating all active Blender processes...');
        renderManager.stopAllRenders();

        // Give processes time to terminate gracefully
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Stop system monitoring
      if (systemMonitor) {
        console.log('Stopping system monitor...');
        systemMonitor.cleanup();
      }

      // Stop mobile companion server
      if (mobileCompanionServer) {
        console.log('Stopping mobile companion server...');
        await mobileCompanionServer.stop();
      }

      console.log('Cleanup completed, quitting app');
    } catch (error) {
      console.error('Error during app cleanup:', error);
    }

    // Now allow the app to quit
    app.exit(0);
  });

  app.on('will-quit', async (event) => {
    console.log('App will-quit event triggered');

    // Ensure cleanup happens even if before-quit didn't run
    try {
      if (renderManager && renderManager.hasActiveRenders()) {
        console.log('Final cleanup: Terminating remaining Blender processes...');
        renderManager.stopAllRenders();
      }
    } catch (error) {
      console.error('Error during final cleanup:', error);
    }
  });

  // Handle close confirmation response from renderer
  ipcMain.handle('confirm-close-app', async () => {
    // Stop all active renders
    if (renderManager) {
      renderManager.stopAllRenders();
    }
    // Force close the window
    if (mainWindow) {
      mainWindow.destroy();
    }
    return true;
  });
}

module.exports = {
  createMainWindow,
  getMainWindow,
  initializeAppLifecycle
};
