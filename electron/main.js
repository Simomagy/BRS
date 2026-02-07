const { app, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const RenderManager = require('./services/render-manager');
const MobileCompanionServer = require('./services/mobile-companion-server');
const SystemMonitor = require('./services/system-monitor');
const { initializeAppLifecycle } = require('./core/app');
const { registerAllHandlers } = require('./core/ipc-controller');
const {
  createRenderOutputWindow,
  sendToRenderOutputWindow
} = require('./core/render-output-window');

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
        path.join(__dirname, 'core/*.js'),
        path.join(__dirname, 'services/*.js'),
        path.join(__dirname, 'handlers/*.js')
      ]
    });
  } catch (_) {
    console.log('Error loading electron-reloader');
  }

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

// Default preset definition
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

// Inizializza i servizi
const renderManager = new RenderManager();
const systemMonitor = new SystemMonitor();

// Getter for mainWindow to pass to services (lazy evaluation)
const getMainWindow = () => mainWindow;
const mobileCompanionServer = new MobileCompanionServer(renderManager, store, { mainWindow: null });

// Inizializza il mobile companion server
function initializeMobileCompanionServer() {
  // Connect renderManager events to mobileCompanionServer
  renderManager.on('render-started', (data) => {
    mobileCompanionServer.broadcastToClients('render-started', data);
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

    // Note: History is now managed by RenderPanel.tsx to avoid duplicates
    // and ensure all data is captured correctly with proper naming
  });

  renderManager.on('render-stopped', async (data) => {
    mobileCompanionServer.broadcastToClients('render-stopped', data);

    // Note: History is now managed by RenderPanel.tsx to avoid duplicates
    // and ensure all data is captured correctly with proper naming
  });

  renderManager.on('render-error', async (data) => {
    mobileCompanionServer.broadcastToClients('render-error', data);

    // Note: History is now managed by RenderPanel.tsx to avoid duplicates
    // and ensure all data is captured correctly with proper naming
  });

  // Setup event listeners
  mobileCompanionServer.on('server-started', (data) => {
    console.log(`Mobile Companion Server started on port ${data.port}`);
  });

  mobileCompanionServer.on('server-stopped', () => {
    console.log('Mobile Companion Server stopped');
  });

  mobileCompanionServer.on('device-paired', (data) => {
    console.log(`New device paired: ${data.deviceName}`);
  });

  // Listen for external render started (e.g., from Blender addon)
  mobileCompanionServer.on('render-started-external', (data) => {
    console.log(`External render started: ${data.processId}`);
    // Forward to renderer to update UI
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('external-render-started', data);
    }
  });

  // Listen for preset changes via API
  mobileCompanionServer.on('preset-saved', (data) => {
    console.log(`Preset saved via API: ${data.preset.name}`);
    // Forward to renderer to refresh preset list
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('preset-updated', data);
    }
  });

  mobileCompanionServer.on('preset-deleted', (data) => {
    console.log(`Preset deleted via API: ${data.presetId}`);
    // Forward to renderer to refresh preset list
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send('preset-deleted', data);
    }
  });
}

// Initialize mobile companion server events
initializeMobileCompanionServer();

// Initialize render output window events
function initializeRenderOutputEvents() {
  // Forward render-output events to the render output window
  renderManager.on('render-output-started', (data) => {
    sendToRenderOutputWindow('render-output-started', data);
  });

  renderManager.on('render-output-progress', (data) => {
    sendToRenderOutputWindow('render-output-progress', data);
  });

  renderManager.on('render-output-completed', (data) => {
    sendToRenderOutputWindow('render-output-completed', data);
  });

  renderManager.on('render-output-failed', (data) => {
    sendToRenderOutputWindow('render-output-failed', data);
  });

  // NOTE: No need to forward render-progress here for UI-started renders
  // They already use event.sender which correctly sends to the UI
  // External renders (from Blender) use the mobile-companion-server sender
  // which sends to mainWindow directly

  // Forward render started events to main window
  renderManager.on('render-started', (data) => {
    if (mainWindow && mainWindow.webContents) {
      console.log(`Forwarding render-started to main window: ${data.processId}`);
      mainWindow.webContents.send('render-started', data);
    }
  });

  // Forward render completed events to main window
  renderManager.on('render-completed', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(`complete-${data.processId}`, data.exitCode || 0);
    }
  });

  // Forward render error events to main window
  renderManager.on('render-error', (data) => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.send(`error-${data.processId}`, data.error || data.message);
    }
  });
}

// Initialize render output events
initializeRenderOutputEvents();

// Get main window lazily for IPC handlers
let mainWindow = null;
app.on('browser-window-created', (event, window) => {
  mainWindow = window;
  // Update reference in mobile companion server
  if (mobileCompanionServer) {
    mobileCompanionServer.mainWindow = mainWindow;
  }
});

// Register render output window handler
ipcMain.handle('open-render-output-window', () => {
  if (!mainWindow) {
    console.error('Main window not available');
    return false;
  }

  try {
    createRenderOutputWindow({ mainWindow });
    return true;
  } catch (error) {
    console.error('Error opening render output window:', error);
    return false;
  }
});

// Registra tutti gli handler IPC
registerAllHandlers({
  get mainWindow() { return mainWindow; },
  store,
  renderManager,
  mobileCompanionServer,
  systemMonitor
});

// Inizializza il ciclo vita dell'app
initializeAppLifecycle({
  renderManager,
  systemMonitor,
  mobileCompanionServer
});
