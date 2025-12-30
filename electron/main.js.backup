const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const os = require('os');
const RenderManager = require('./renderManager');
const MobileCompanionServer = require('./mobileCompanionServer');

// Determina se siamo in modalità sviluppo basandoci sul percorso di esecuzione
const isDevelopment = app.isPackaged === false;

// Aggiungi il reloader in modalità sviluppo
if (isDevelopment) {
  try {
    require('electron-reloader')(module, {
      debug: true,
      watchRenderer: true,
      ignore: [
        'node_modules/**/*',
        'src/**/*',
        'build/**/*',
        'dist/**/*',
        '.next/**/*',
        'public/**/*'
      ],
      watch: [
        path.join(__dirname, '*.js'),
        path.join(__dirname, '*.json')
      ]
    });
  } catch (_) { console.log('Error loading electron-reloader'); }
  
  // Add additional cleanup for development mode
  process.on('SIGINT', () => {
    console.log('SIGINT received in development mode, cleaning up...');
    if (renderManager && renderManager.hasActiveRenders()) {
      renderManager.stopAllRenders();
    }
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('SIGTERM received in development mode, cleaning up...');
    if (renderManager && renderManager.hasActiveRenders()) {
      renderManager.stopAllRenders();
    }
    process.exit(0);
  });
}

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  
  // Ensure cleanup on uncaught exceptions
  try {
    if (renderManager && renderManager.hasActiveRenders()) {
      console.log('Cleaning up processes due to uncaught exception...');
      renderManager.stopAllRenders();
    }
  } catch (cleanupError) {
    console.error('Error during cleanup in uncaught exception handler:', cleanupError);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  
  // Ensure cleanup on unhandled rejections
  try {
    if (renderManager && renderManager.hasActiveRenders()) {
      console.log('Cleaning up processes due to unhandled rejection...');
      renderManager.stopAllRenders();
    }
  } catch (cleanupError) {
    console.error('Error during cleanup in unhandled rejection handler:', cleanupError);
  }
});

const defaultPreset = {
  id: 'default',
  name: 'default',
  version: '1.0.0',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  parameters: {
  blenderPath: '',
  blendFile: '',
  outputDir: '',
  resolution: {
    width: 1920,
    height: 1080
  },
  frameRange: {
    start: 1,
    end: 1
  },
    outputFormat: 'PNG'
  },
  metadata: {
    lastUsed: new Date().toISOString()
  }
};

// Inizializza lo store
const store = new Store();

// Inizializza i valori predefiniti se non esistono
if (!store.has('presets')) {
  store.set('presets', [defaultPreset]);
}
if (!store.has('defaultPreset')) {
  store.set('defaultPreset', 'default');
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 850,
    minWidth: 1440,
    minHeight: 850,
    icon: path.join(__dirname, '../public/app_icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
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
    const indexPath = path.join(__dirname, '../out/index.html');
    // console.log('Tentativo di caricamento da:', indexPath);
    // console.log('isDevelopment:', isDevelopment);

    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
      // console.log('File index.html trovato e caricato');
    } else {
      console.error('File index.html non trovato in:', indexPath);
      mainWindow.loadURL('about:blank');
    }
  }

  // Handle window close event with render check
  mainWindow.on('close', async (event) => {
    // Check if there are any active renders
    if (renderManager.hasActiveRenders()) {
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

  // Registra l'handler per execute-command
  ipcMain.handle('execute-command', async (event, command) => {
    try {
      const result = await renderManager.executeCommand(command);
      return { success: true, result };
    } catch (error) {
      console.error('Errore nell\'esecuzione del comando:', error);
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
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
    if (systemMonitorInterval) {
      clearInterval(systemMonitorInterval);
      systemMonitorInterval = null;
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

// File system operations
ipcMain.handle('open-file-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result.filePaths;
});

ipcMain.handle('open-directory', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    ...options,
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('open-path', async (event, dirPath) => {
  try {
      await shell.openPath(dirPath);
      return true;
  } catch (error) {
    console.error('Error opening path:', error);
    return false;
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = await fs.promises.readFile(filePath, 'utf8');
    return data;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    await fs.promises.writeFile(filePath, data, 'utf8');
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
});

ipcMain.handle('get-app-data-path', () => {
  switch (process.platform) {
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Roaming', 'BlenderRenderSuite');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'BlenderRenderSuite');
    default:
      return path.join(os.homedir(), '.config', 'blender-render-suite');
  }
});

// Gestori IPC per i preset
ipcMain.handle('getAllPresets', async () => {
  try {
    const presets = store.get('presets', []);
    return presets;
  } catch (error) {
    console.error('Error getting presets:', error);
    return [];
  }
});

ipcMain.handle('getPreset', async (_, id) => {
  try {
    const presets = store.get('presets', []);
    const preset = presets.find(p => p.id === id);
    return preset || null;
  } catch (error) {
    console.error('Error getting preset:', error);
    return null;
  }
});

ipcMain.handle('savePreset', async (_, preset) => {
  try {
    const presets = store.get('presets', []);
    const index = presets.findIndex(p => p.id === preset.id);

    if (index >= 0) {
      presets[index] = preset;
    } else {
      presets.push(preset);
    }

  store.set('presets', presets);
  return true;
  } catch (error) {
    console.error('Error saving preset:', error);
    return false;
  }
});

ipcMain.handle('deletePreset', async (_, id) => {
  try {
    const presets = store.get('presets', []);
    const filteredPresets = presets.filter(p => p.id !== id);
    store.set('presets', filteredPresets);
    return true;
  } catch (error) {
    console.error('Error deleting preset:', error);
    return false;
  }
});

ipcMain.handle('renamePreset', async (_, id, newName) => {
  try {
    const presets = store.get('presets', []);
    const preset = presets.find(p => p.id === id);

    if (!preset) return false;

    preset.name = newName;
    preset.updatedAt = new Date().toISOString();

  store.set('presets', presets);
    return true;
  } catch (error) {
    console.error('Error renaming preset:', error);
    return false;
  }
});

// Funzione di validazione preset
function validatePreset(preset) {
  // Verifica solo i campi essenziali
  if (!preset || typeof preset !== 'object') {
    throw new Error('Invalid preset format');
  }

  // Verifica i campi obbligatori
  if (!preset.id || typeof preset.id !== 'string') {
    throw new Error('Missing or invalid preset ID');
  }
  if (!preset.name || typeof preset.name !== 'string') {
    throw new Error('Missing or invalid preset name');
  }
  if (!preset.version || typeof preset.version !== 'string') {
    throw new Error('Missing or invalid version');
  }
  if (!preset.createdAt || typeof preset.createdAt !== 'string') {
    throw new Error('Missing or invalid creation date');
  }
  if (!preset.updatedAt || typeof preset.updatedAt !== 'string') {
    throw new Error('Missing or invalid update date');
  }

  // Verifica che parameters sia un oggetto (se presente)
  if (preset.parameters && typeof preset.parameters !== 'object') {
    throw new Error('Parameters must be an object');
  }

  // Verifica che metadata sia un oggetto (se presente)
  if (preset.metadata && typeof preset.metadata !== 'object') {
    throw new Error('Metadata must be an object');
  }

  return true;
}

// Modifico l'handler importPresets per usare direttamente il preset importato
ipcMain.handle('importPresets', async (event, filePath) => {
  try {
    if (!filePath) {
      console.error('No file path provided');
      return {
        success: false,
        message: 'No file path provided'
      };
    }

    console.log('Importing presets from:', filePath);
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    console.log('File content read successfully');

    const preset = JSON.parse(fileContent);
    console.log('Parsed preset:', preset);

    // Valida il preset
    validatePreset(preset);
    console.log('Preset validation passed');

    // Verifica se esiste già un preset con lo stesso nome
    const existingPresets = store.get('presets', []);
    console.log('Current presets:', existingPresets);
    const existingPreset = existingPresets.find(p => p.name === preset.name);

    if (existingPreset) {
      // Se esiste, aggiungi un timestamp al nome
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      preset.name = `${preset.name}_${timestamp}`;
      console.log('Renamed preset to:', preset.name);
    }

    // Aggiungi il preset alla lista
    existingPresets.push(preset);
    console.log('Saving presets:', existingPresets);
    store.set('presets', existingPresets);

    // Verifica che sia stato salvato
    const savedPresets = store.get('presets', []);
    console.log('Verified saved presets:', savedPresets);

    console.log('Preset imported successfully');
    return { success: true };
  } catch (error) {
    console.error('Error importing preset:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to import preset'
    };
  }
});

// Funzione per verificare se un percorso è un eseguibile Blender valido
async function isValidBlenderExecutable(executablePath) {
  try {
    // Verifica che il file esista
    if (!fs.existsSync(executablePath)) {
      return false;
    }

    // Verifica che sia un file eseguibile
    if (os.platform() === 'win32') {
      return executablePath.toLowerCase().endsWith('.exe');
    } else if (os.platform() === 'darwin') {
      return executablePath.toLowerCase().endsWith('.app');
    } else {
      // Linux
      const stats = fs.statSync(executablePath);
      return stats.isFile() && (stats.mode & fs.constants.S_IXUSR);
    }
  } catch (error) {
    console.error('Error checking Blender executable:', error);
    return false;
  }
}

// Funzione per cercare Blender nelle posizioni standard
async function findBlenderInStandardLocations() {
  const versions = [];

  if (os.platform() === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    // Funzione per cercare in una directory
    const searchInDirectory = async (baseDir) => {
      try {
        if (!fs.existsSync(baseDir)) return [];

        const blenderDir = path.join(baseDir, 'Blender Foundation');
        if (!fs.existsSync(blenderDir)) return [];

        const entries = await fs.promises.readdir(blenderDir);
        const blenderVersions = entries.filter(entry => entry.startsWith('Blender'));

        for (const version of blenderVersions) {
          const blenderPath = path.join(blenderDir, version, 'blender.exe');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: version.replace('Blender ', '')
            });
          }
        }
      } catch (error) {
        console.error('Error searching in directory:', error);
      }
    };

    // Cerca in Program Files
    if (programFiles) {
      await searchInDirectory(programFiles);
    }

    // Cerca in Program Files (x86)
    if (programFilesX86) {
      await searchInDirectory(programFilesX86);
    }

    // Cerca in AppData locale
    if (localAppData) {
      const blenderDir = path.join(localAppData, 'Programs', 'Blender');
      if (fs.existsSync(blenderDir)) {
        const entries = await fs.promises.readdir(blenderDir);
        for (const entry of entries) {
          const blenderPath = path.join(blenderDir, entry, 'blender.exe');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: entry
            });
          }
        }
      }
    }
  } else if (os.platform() === 'darwin') {
    // macOS
    const searchPaths = [
      '/Applications',
      path.join(os.homedir(), 'Applications')
    ];

    for (const basePath of searchPaths) {
      try {
        if (!fs.existsSync(basePath)) continue;

        const entries = await fs.promises.readdir(basePath);
        const blenderApps = entries.filter(entry => entry.startsWith('Blender'));

        for (const app of blenderApps) {
          const blenderPath = path.join(basePath, app, 'Contents', 'MacOS', 'Blender');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: app.replace('Blender', '').trim()
            });
          }
        }
      } catch (error) {
        console.error('Error searching in directory:', error);
      }
    }
  } else {
    // Linux
    const searchPaths = [
      '/usr/bin',
      '/usr/local/bin',
      path.join(os.homedir(), '.local/bin')
    ];

    // Prima cerca nei percorsi standard
    for (const searchPath of searchPaths) {
      const blenderPath = path.join(searchPath, 'blender');
      if (await isValidBlenderExecutable(blenderPath)) {
        versions.push({
          path: blenderPath,
          version: 'System'
        });
      }
    }

    // Poi cerca in /opt
    try {
      if (fs.existsSync('/opt')) {
        const entries = await fs.promises.readdir('/opt');
        const blenderDirs = entries.filter(entry => entry.startsWith('blender'));

        for (const dir of blenderDirs) {
          const blenderPath = path.join('/opt', dir, 'blender');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: dir.replace('blender', '').trim()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error searching in /opt:', error);
    }
  }

  return versions;
}

// Handler per il rilevamento automatico di Blender
ipcMain.handle('detect-blender', async () => {
  try {
    const versions = await findBlenderInStandardLocations();
    return versions;
  } catch (error) {
    console.error('Error detecting Blender:', error);
    return [];
  }
});

// Blender info handlers
ipcMain.handle('get-blender-version', async () => {
  try {
    const presets = store.get('presets', []);
    const defaultPresetId = store.get('defaultPreset', 'default');
    const defaultPreset = presets.find(p => p.id === defaultPresetId);

    if (!defaultPreset) return 'Unknown';

    return defaultPreset.parameters.blenderPath ?
      await renderManager.getBlenderVersion(defaultPreset.parameters.blenderPath) :
      'Unknown';
  } catch (error) {
    console.error('Error getting Blender version:', error);
    return 'Unknown';
  }
});

ipcMain.handle('get-render-engine', async () => {
  try {
    const presets = store.get('presets', []);
    const defaultPresetId = store.get('defaultPreset', 'default');
    const defaultPreset = presets.find(p => p.id === defaultPresetId);

    if (!defaultPreset) return 'Unknown';

    return defaultPreset.parameters.renderEngine || 'Unknown';
  } catch (error) {
    console.error('Error getting render engine:', error);
    return 'Unknown';
  }
});

ipcMain.handle('get-output-path', async () => {
  try {
    const presets = store.get('presets', []);
    const defaultPresetId = store.get('defaultPreset', 'default');
    const defaultPreset = presets.find(p => p.id === defaultPresetId);

    if (!defaultPreset) return '';

    return defaultPreset.parameters.outputDir || '';
  } catch (error) {
    console.error('Error getting output path:', error);
    return '';
  }
});

// Aggiungi questi handler IPC
ipcMain.handle('save-history', (event, history) => {
    try {
        store.set('renderHistory', history);
        return true;
    } catch (error) {
        console.error('Error saving history:', error);
        return false;
    }
});

ipcMain.handle('load-history', () => {
    try {
        return store.get('renderHistory', []);
    } catch (error) {
        console.error('Error loading history:', error);
        return [];
    }
});

// Aggiungi questo handler
ipcMain.handle('show-directory-picker', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Installation Directory'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('Error showing directory picker:', error);
    return null;
  }
});

// Gestori IPC per l'onboarding
ipcMain.handle('getOnboardingStatus', async () => {
  try {
    const isCompleted = store.get('onboardingCompleted', false);
    return { completed: isCompleted };
  } catch (error) {
    console.error('Error getting onboarding status:', error);
    return { completed: false };
  }
});

ipcMain.handle('setOnboardingCompleted', async (event, completed) => {
  try {
    store.set('onboardingCompleted', completed);
    return true;
  } catch (error) {
    console.error('Error setting onboarding completion:', error);
    return false;
  }
});

// File existence checker
ipcMain.handle('file-exists', async (event, filePath) => {
  try {
    return fs.existsSync(filePath);
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
});

// Inizializza il renderManager
const renderManager = new RenderManager();

// Inizializza il mobile companion server
let mobileCompanionServer = null;

function initializeMobileCompanionServer() {
  if (!mobileCompanionServer) {
    mobileCompanionServer = new MobileCompanionServer(renderManager, store);
    
    // Connect renderManager events to mobileCompanionServer
    renderManager.on('render-started', (data) => {
      mobileCompanionServer.broadcastToClients('render-started', data);
      
      // Send push notification for render start
      console.log('🚀 SENDING RENDER STARTED NOTIFICATION');
      console.log('  - Process ID:', data.processId);
      console.log('  - Command:', data.command?.substring(0, 50) + '...');
      mobileCompanionServer.broadcastPushNotification({
        title: 'Render Started 🚀',
        body: 'Your Blender render has started processing.',
        data: {
          type: 'render_started',
          processId: String(data.processId || 'unknown'),
          startTime: String(data.startTime || new Date().toISOString()),
          command: String(data.command?.substring(0, 100) || 'Unknown command')
        }
      });
    });

    renderManager.on('render-progress', (data) => {
      mobileCompanionServer.broadcastToClients('render-progress', data);
    });

    renderManager.on('render-completed', async (data) => {
      mobileCompanionServer.broadcastToClients('render-completed', data);
      
      // Send push notification for render completion
      console.log('✅ SENDING RENDER COMPLETED NOTIFICATION');
      console.log('  - Process ID:', data.processId);
      console.log('  - Exit Code:', data.exitCode);
      mobileCompanionServer.broadcastPushNotification({
        title: 'Render Completed ✅',
        body: 'Your Blender render has finished successfully!',
        data: {
          type: 'render_completed',
          processId: String(data.processId || 'unknown'),
          exitCode: String(data.exitCode || 0),
          endTime: new Date().toISOString()
        }
      });
      
      // Save to history
      try {
        const history = await store.get('renderHistory', []);
        const historyEntry = {
          id: require('crypto').randomUUID(),
          name: `Render ${new Date().toLocaleString()}`,
          command: data.command || 'Unknown command',
          status: 'completed',
          startTime: data.startTime || new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: data.duration || 0,
          progress: 100,
          currentFrame: data.currentFrame || 0,
          totalFrames: data.totalFrames || 0,
          currentSample: data.currentSample || 0,
          totalSamples: data.totalSamples || 0,
          parameters: {
            blenderVersion: data.blenderVersion || '',
            renderEngine: data.renderEngine || '',
            outputPath: data.outputPath || '',
            totalFrames: data.totalFrames || 0,
            lastUsed: new Date().toISOString(),
          }
        };
        
        const updatedHistory = [historyEntry, ...history].slice(0, 100); // Keep last 100 entries
        await store.set('renderHistory', updatedHistory);
      } catch (error) {
        console.error('Failed to save to history:', error);
      }
    });

    renderManager.on('render-stopped', async (data) => {
      mobileCompanionServer.broadcastToClients('render-stopped', data);
      
      // Send push notification for render stop
      console.log('🛑 SENDING RENDER STOPPED NOTIFICATION');
      console.log('  - Process ID:', data.processId);
      mobileCompanionServer.broadcastPushNotification({
        title: 'Render Stopped 🛑',
        body: 'Your Blender render has been stopped.',
        data: {
          type: 'render_stopped',
          processId: String(data.processId || 'unknown'),
          stopTime: new Date().toISOString()
        }
      });
      
      // Save to history
      try {
        const history = await store.get('renderHistory', []);
        const historyEntry = {
          id: require('crypto').randomUUID(),
          name: `Render ${new Date().toLocaleString()} (Stopped)`,
          command: data.command || 'Unknown command',
          status: 'stopped',
          startTime: data.startTime || new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: data.duration || 0,
          progress: data.progress || 0,
          currentFrame: data.currentFrame || 0,
          totalFrames: data.totalFrames || 0,
          currentSample: data.currentSample || 0,
          totalSamples: data.totalSamples || 0,
          parameters: {
            blenderVersion: data.blenderVersion || '',
            renderEngine: data.renderEngine || '',
            outputPath: data.outputPath || '',
            totalFrames: data.totalFrames || 0,
            lastUsed: new Date().toISOString(),
          }
        };
        
        const updatedHistory = [historyEntry, ...history].slice(0, 100);
        await store.set('renderHistory', updatedHistory);
      } catch (error) {
        console.error('Failed to save to history:', error);
      }
    });

    renderManager.on('render-error', async (data) => {
      mobileCompanionServer.broadcastToClients('render-error', data);
      
      // Send push notification for render error
      console.log('❌ SENDING RENDER ERROR NOTIFICATION');
      console.log('  - Process ID:', data.processId);
      console.log('  - Error:', data.error?.substring(0, 100));
      mobileCompanionServer.broadcastPushNotification({
        title: 'Render Error ❌',
        body: 'Your Blender render encountered an error and stopped.',
        data: {
          type: 'render_error',
          processId: String(data.processId || 'unknown'),
          error: String(data.error?.substring(0, 200) || 'Unknown error'),
          errorTime: new Date().toISOString()
        }
      });
      
      // Save to history
      try {
        const history = await store.get('renderHistory', []);
        const historyEntry = {
          id: require('crypto').randomUUID(),
          name: `Render ${new Date().toLocaleString()} (Error)`,
          command: data.command || 'Unknown command',
          status: 'failed',
          startTime: data.startTime || new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration: data.duration || 0,
          progress: data.progress || 0,
          currentFrame: data.currentFrame || 0,
          totalFrames: data.totalFrames || 0,
          currentSample: data.currentSample || 0,
          totalSamples: data.totalSamples || 0,
          error: data.error || 'Unknown error',
          parameters: {
            blenderVersion: data.blenderVersion || '',
            renderEngine: data.renderEngine || '',
            outputPath: data.outputPath || '',
            totalFrames: data.totalFrames || 0,
            lastUsed: new Date().toISOString(),
          }
        };
        
        const updatedHistory = [historyEntry, ...history].slice(0, 100);
        await store.set('renderHistory', updatedHistory);
      } catch (error) {
        console.error('Failed to save to history:', error);
      }
    });
    
    // Setup event listeners
    mobileCompanionServer.on('server-started', (data) => {
      console.log(`Mobile Companion Server started on port ${data.port}`);
      if (mainWindow) {
        mainWindow.webContents.send('mobile-server-status', {
          isRunning: true,
          port: data.port
        });
      }
    });

    mobileCompanionServer.on('server-stopped', () => {
      console.log('Mobile Companion Server stopped');
      if (mainWindow) {
        mainWindow.webContents.send('mobile-server-status', {
          isRunning: false
        });
      }
    });

    mobileCompanionServer.on('device-paired', (data) => {
      console.log(`New device paired: ${data.deviceName}`);
      if (mainWindow) {
        mainWindow.webContents.send('device-paired', data);
      }
    });

    mobileCompanionServer.on('pairing-code-generated', (code) => {
      console.log(`Pairing code generated: ${code}`);
      if (mainWindow) {
        mainWindow.webContents.send('pairing-code-generated', code);
      }
    });

    mobileCompanionServer.on('pairing-code-cleared', () => {
      if (mainWindow) {
        mainWindow.webContents.send('pairing-code-cleared');
      }
    });
  }
  return mobileCompanionServer;
}

// Handle close confirmation response from renderer
ipcMain.handle('confirm-close-app', async () => {
  // Stop all active renders
  renderManager.stopAllRenders();
  // Force close the window
  if (mainWindow) {
    mainWindow.destroy();
  }
  return true;
});

// System monitoring variables
let systemMonitorInterval = null;

// Function to get GPU stats using Windows wmic and nvidia-smi
async function getGPUStats() {
  const gpuStats = [];
  
  if (process.platform === 'win32') {
    try {
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);
      
      // Get detailed GPU info excluding virtual monitors
      const gpuInfoCommand = 'wmic path win32_VideoController get name,AdapterRAM,DriverVersion,Status /format:csv';
      const { stdout: gpuInfo } = await execAsync(gpuInfoCommand);
      
      // Filter to exclude virtual GPUs, monitors, and integrated graphics
      const virtualGPUKeywords = [
        'virtual', 'monitor', 'remote', 'vnc', 'rdp', 'teamviewer',
        'parsec', 'meta', 'desktop', 'software', 'basic', 'standard'
      ];
      
      // Filter to exclude integrated graphics (common patterns)
      const integratedGPUKeywords = [
        'uhd graphics', 'hd graphics', 'iris', 'vega', 'radeon graphics',
        'integrated', 'onboard', 'chipset', 'shared', 'family'
      ];
      
      // Parse GPU info
      const lines = gpuInfo.split('\n').filter(line => line.trim() && !line.includes('Node'));
      const validGPUs = [];
      
      for (const line of lines) {
        const parts = line.split(',');
        if (parts.length >= 4) {
          const adapterRAM = parseInt(parts[1]) || 0;
          const name = (parts[3] || 'Unknown GPU').trim();
          const status = (parts[4] || '').trim();
          
          // Skip if GPU name contains virtual keywords or has no memory
          const isVirtual = virtualGPUKeywords.some(keyword =>
            name.toLowerCase().includes(keyword.toLowerCase())
          );
          
          // Skip if GPU is integrated graphics
          const isIntegrated = integratedGPUKeywords.some(keyword =>
            name.toLowerCase().includes(keyword.toLowerCase())
          );
          
          // Only include GPUs that are OK status, have memory, are not virtual, and are not integrated
          if (!isVirtual && !isIntegrated && status.toLowerCase() === 'ok' && adapterRAM > 0) {
            validGPUs.push({ name, adapterRAM });
            // console.log(`[BRS] Valid discrete GPU found: ${name} (${Math.floor(adapterRAM / 1024 / 1024 / 1024)} GB)`);
          } else if (isIntegrated) {
            // console.log(`[BRS] Integrated GPU filtered out: ${name}`);
          }
        }
      }
      
      // Now get real-time data for each valid GPU
      for (const gpu of validGPUs) {
        let gpuData = {
          name: gpu.name,
          usage: '0%',
          memory: {
            used: '0 GB',
            total: `${Math.floor(gpu.adapterRAM / 1024 / 1024 / 1024)} GB`,
            percentage: '0%'
          },
          temperature: 'N/A',
          power: 'N/A'
        };
        
        // Try to get NVIDIA GPU stats using nvidia-smi
        if (gpu.name.toLowerCase().includes('nvidia')) {
          try {
            const nvidiaCommand = 'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr,clocks.mem --format=csv,noheader,nounits';
            const { stdout: nvidiaStats } = await execAsync(nvidiaCommand);
            
            const lines = nvidiaStats.trim().split('\n');
            if (lines.length > 0) {
              const stats = lines[0].split(',').map(s => s.trim());
              if (stats.length >= 7) {
                const usage = parseInt(stats[0]) || 0;
                const memoryUsed = parseFloat(stats[1]) || 0;
                const memoryTotal = parseFloat(stats[2]) || 0;
                const temperature = parseInt(stats[3]) || 0;
                const power = parseFloat(stats[4]) || 0;
                const coreClock = parseInt(stats[5]) || 0;
                const memoryClock = parseInt(stats[6]) || 0;
                
                gpuData = {
                  name: gpu.name,
                  usage: `${usage}%`,
                  memory: {
                    used: `${(memoryUsed / 1024).toFixed(1)} GB`,
                    total: `${(memoryTotal / 1024).toFixed(0)} GB`,
                    percentage: `${memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0}%`
                  },
                  temperature: `${temperature}°C`,
                  power: `${power.toFixed(0)}W`,
                  coreClock: `${coreClock} MHz`,
                  memoryClock: `${memoryClock} MHz`
                };
              }
            }
          } catch (nvidiaError) {
            console.log('nvidia-smi not available or failed:', nvidiaError.message);
          }
        }
        
        // Try to get Intel GPU stats using Intel Arc Control (if available)
        else if (gpu.name.toLowerCase().includes('intel')) {
          try {
            // For Intel GPUs, we can try to use Windows Performance Counters
            const intelCommand = 'typeperf "\\GPU Engine(*)\\Utilization Percentage" -sc 1';
            const { stdout: intelStats } = await execAsync(intelCommand);
            
            // Parse Intel GPU utilization (this is a simplified approach)
            const utilizationMatch = intelStats.match(/(\d+\.?\d*)/);
            if (utilizationMatch) {
              const usage = Math.round(parseFloat(utilizationMatch[1]));
              gpuData.usage = `${usage}%`;
            }
          } catch (intelError) {
            console.log('Intel GPU monitoring not available:', intelError.message);
          }
        }
        
        // Try to get AMD GPU stats using AMD software (if available)
        else if (gpu.name.toLowerCase().includes('amd') || gpu.name.toLowerCase().includes('radeon')) {
          try {
            // For AMD GPUs, try to use WMI queries for GPU performance
            const amdCommand = 'wmic path Win32_PerfRawData_GPUPerformanceCounters_GPUEngine get Name,UtilizationPercentage /format:csv';
            const { stdout: amdStats } = await execAsync(amdCommand);
            
            // This would need more sophisticated parsing for AMD GPUs
            console.log('AMD GPU detection attempted');
          } catch (amdError) {
            console.log('AMD GPU monitoring not available:', amdError.message);
          }
        }
        
        gpuStats.push(gpuData);
      }
      
    } catch (error) {
      console.error('Error getting GPU stats:', error);
    }
  }
  
  // If no valid GPUs found, don't add any fallback data
  return gpuStats;
}

// Function to get system stats
async function getSystemStats() {
  const cpus = os.cpus();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  
  // Calculate CPU usage (simplified approach)
  const cpuUsage = cpus.reduce((acc, cpu) => {
    const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
    const idle = cpu.times.idle;
    return acc + ((total - idle) / total) * 100;
  }, 0) / cpus.length;

  // Get GPU stats
  const gpuStats = await getGPUStats();

  return {
    cpu: {
      usage: `${cpuUsage.toFixed(1)}%`,
      cores: cpus.map(cpu => `${cpu.model} @ ${cpu.speed}MHz`)
    },
    memory: {
      used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      percentage: `${((usedMem / totalMem) * 100).toFixed(1)}%`
    },
    gpu: gpuStats
  };
}

// System monitoring handlers
ipcMain.handle('start-system-monitor', async () => {
  if (systemMonitorInterval) {
    clearInterval(systemMonitorInterval);
  }
  
  // Send initial stats
  if (mainWindow) {
    const stats = await getSystemStats();
    mainWindow.webContents.send('system-stats', stats);
  }
  
  // Start monitoring every 0.5 seconds
  systemMonitorInterval = setInterval(async () => {
    if (mainWindow) {
      const stats = await getSystemStats();
      mainWindow.webContents.send('system-stats', stats);
    }
  }, 1000);
});

ipcMain.handle('stop-system-monitor', async () => {
  if (systemMonitorInterval) {
    clearInterval(systemMonitorInterval);
    systemMonitorInterval = null;
  }
});

// Mobile Companion Server IPC handlers
ipcMain.handle('mobile-server-start', async () => {
  try {
    const server = initializeMobileCompanionServer();
    await server.start();
    return { success: true, status: server.getStatus() };
  } catch (error) {
    console.error('Error starting mobile companion server:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-server-stop', async () => {
  try {
    if (mobileCompanionServer) {
      await mobileCompanionServer.stop();
    }
    return { success: true };
  } catch (error) {
    console.error('Error stopping mobile companion server:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mobile-server-status', async () => {
  try {
    if (mobileCompanionServer) {
      return { success: true, status: mobileCompanionServer.getStatus() };
    }
    return { success: true, status: { isRunning: false } };
  } catch (error) {
    console.error('Error getting mobile server status:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('generate-pairing-code', async () => {
  try {
    const server = initializeMobileCompanionServer();
    const code = server.generatePairingCode();
    return { success: true, code };
  } catch (error) {
    console.error('Error generating pairing code:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('clear-pairing-code', async () => {
  try {
    if (mobileCompanionServer) {
      mobileCompanionServer.clearPairingCode();
    }
    return { success: true };
  } catch (error) {
    console.error('Error clearing pairing code:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-paired-devices', async () => {
  try {
    if (mobileCompanionServer) {
      const devices = mobileCompanionServer.getPairedDevices();
      return { success: true, devices };
    }
    return { success: true, devices: [] };
  } catch (error) {
    console.error('Error getting paired devices:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('remove-paired-device', async (_, deviceId) => {
  try {
    if (mobileCompanionServer) {
      const removed = mobileCompanionServer.removePairedDevice(deviceId);
      return { success: true, removed };
    }
    return { success: false, error: 'Server not initialized' };
  } catch (error) {
    console.error('Error removing paired device:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-connected-devices', async () => {
  try {
    if (mobileCompanionServer) {
      const devices = mobileCompanionServer.getConnectedDevices();
      return { success: true, devices };
    }
    return { success: true, devices: [] };
  } catch (error) {
    console.error('Error getting connected devices:', error);
    return { success: false, error: error.message };
  }
});
