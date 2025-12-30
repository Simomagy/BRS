const { app } = require('electron');
const path = require('path');
const Store = require('electron-store');
const RenderManager = require('./services/render-manager');
const MobileCompanionServer = require('./services/mobile-companion-server');
const SystemMonitor = require('./services/system-monitor');
const { initializeAppLifecycle } = require('./core/app');
const { registerAllHandlers } = require('./core/ipc-controller');

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
const mobileCompanionServer = new MobileCompanionServer(renderManager, store);

// Inizializza il mobile companion server
function initializeMobileCompanionServer() {
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
  });

  mobileCompanionServer.on('server-stopped', () => {
    console.log('Mobile Companion Server stopped');
  });

  mobileCompanionServer.on('device-paired', (data) => {
    console.log(`New device paired: ${data.deviceName}`);
  });
}

// Initialize mobile companion server events
initializeMobileCompanionServer();

// Get main window lazily for IPC handlers
let mainWindow = null;
app.on('browser-window-created', (event, window) => {
  mainWindow = window;
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
