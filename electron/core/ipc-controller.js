const { ipcMain } = require('electron');
const fileHandlers = require('../handlers/file-handlers');
const presetHandlers = require('../handlers/preset-handlers');
const blenderHandlers = require('../handlers/blender-handlers');

/**
 * Register all IPC handlers
 * @param {Object} dependencies - Application dependencies
 * @param {BrowserWindow} dependencies.mainWindow - Main application window
 * @param {Store} dependencies.store - Electron store instance
 * @param {RenderManager} dependencies.renderManager - Render manager instance
 * @param {MobileCompanionServer} dependencies.mobileCompanionServer - Mobile companion server instance
 */
function registerAllHandlers(dependencies) {
  const { mainWindow, store, renderManager, mobileCompanionServer } = dependencies;

  // Register file-related handlers
  fileHandlers.register(mainWindow);

  // Register preset-related handlers
  presetHandlers.register(store);

  // Register Blender-related handlers
  blenderHandlers.register(store, renderManager);

  // Onboarding handlers
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

  // History handlers
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

  // Mobile Companion Server IPC handlers
  ipcMain.handle('mobile-server-start', async () => {
    try {
      if (!mobileCompanionServer) {
        return { success: false, error: 'Server not initialized' };
      }
      await mobileCompanionServer.start();
      return { success: true, status: mobileCompanionServer.getStatus() };
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
      if (!mobileCompanionServer) {
        return { success: false, error: 'Server not initialized' };
      }
      const code = mobileCompanionServer.generatePairingCode();
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
}

module.exports = { registerAllHandlers };
