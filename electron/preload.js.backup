const { contextBridge, ipcRenderer } = require('electron');
const { execSync } = require('child_process');

console.log('Preload script is running');

// Create a map to store running processes
const runningProcesses = new Map();

// Enhanced helper function to kill a process tree
async function killProcessTree(pid) {
  console.log(`killProcessTree called with PID: ${pid}`);

  if (process.platform === 'win32') {
    try {
      console.log(`Executing taskkill on PID: ${pid}`);
      
      // First attempt: Try to terminate gracefully with /T flag for process tree
      const gracefulCommand = `taskkill /pid ${pid} /T`;
      console.log(`Graceful command: ${gracefulCommand}`);

      try {
        execSync(gracefulCommand, { timeout: 5000 });
        console.log(`Graceful taskkill successful for PID: ${pid}`);
        
        // Wait a moment to verify termination
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if process still exists
        try {
          execSync(`tasklist /FI "PID eq ${pid}"`, { stdio: 'pipe' });
          console.log(`Process ${pid} still running, forcing termination...`);
          
          // Force kill if still running
          const forceCommand = `taskkill /pid ${pid} /T /F`;
          execSync(forceCommand, { timeout: 5000 });
          console.log(`Force taskkill successful for PID: ${pid}`);
        } catch (checkError) {
          // Process not found in tasklist, which means it was terminated
          console.log(`Process ${pid} successfully terminated`);
        }
        
        return true;
      } catch (error) {
        console.error(`Error in graceful taskkill: ${error.message}`);
        
        // Fallback: Force kill immediately
        try {
          const forceCommand = `taskkill /pid ${pid} /T /F`;
          console.log(`Force command: ${forceCommand}`);
          execSync(forceCommand, { timeout: 5000 });
          console.log(`Force taskkill successful for PID: ${pid}`);
          return true;
        } catch (forceError) {
          console.error(`Error in force taskkill: ${forceError.message}`);
          return false;
        }
      }
    } catch (error) {
      console.error('General error in killProcessTree:', error);
      return false;
    }
  } else {
    // Unix-like systems (macOS, Linux)
    try {
      const proc = runningProcesses.get(pid);
      console.log(`Process retrieved from map:`, proc ? "yes" : "no");

      if (!proc) {
        console.log(`No process found for PID: ${pid}`);
        return false;
      }

      console.log(`Sending SIGTERM to process PID: ${pid}`);
      proc.kill('SIGTERM');

      // Wait for graceful termination
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (proc.killed) {
        console.log(`Process terminated with SIGTERM`);
        return true;
      }

      console.log(`SIGTERM failed, attempting SIGKILL`);
      proc.kill('SIGKILL');
      
      // Wait a bit more for force kill
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log(`Process force killed with SIGKILL`);
      return true;
    } catch (error) {
      console.error('Error killing process:', error);
      return false;
    }
  }
}

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // File system operations
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  openDirectory: (options) => ipcRenderer.invoke('open-directory', options),
  openPath: (dirPath) => ipcRenderer.invoke('open-path', dirPath),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),

  // Application data path
  getAppDataPath: () => ipcRenderer.invoke('get-app-data-path'),

  // Preset management
  getAllPresets: () => ipcRenderer.invoke('getAllPresets'),
  getPreset: (id) => ipcRenderer.invoke('getPreset', id),
  savePreset: (preset) => ipcRenderer.invoke('savePreset', preset),
  deletePreset: (id) => ipcRenderer.invoke('deletePreset', id),
  renamePreset: (oldName, newName) => ipcRenderer.invoke('renamePreset', oldName, newName),
  importPresets: (filePath) => ipcRenderer.invoke('importPresets', filePath),
  detectBlender: () => ipcRenderer.invoke('detect-blender'),

  // Onboarding management
  getOnboardingStatus: () => ipcRenderer.invoke('getOnboardingStatus'),
  setOnboardingCompleted: (completed) => ipcRenderer.invoke('setOnboardingCompleted', completed),

  // File system utilities
  fileExists: (filePath) => ipcRenderer.invoke('file-exists', filePath),

  // Render management
  executeCommand: (command) => ipcRenderer.invoke('executeCommand', command),
  stopProcess: async (id) => {
    const success = await killProcessTree(id);
    if (success) {
      runningProcesses.delete(id);
    }
    return success;
  },
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
  storeProcess: (pid, process) => runningProcesses.set(pid, process),
  startSystemMonitor: () => ipcRenderer.invoke('start-system-monitor'),
  stopSystemMonitor: () => ipcRenderer.invoke('stop-system-monitor'),
  onSystemStats: (callback) => {
    ipcRenderer.on('system-stats', (event, stats) => callback(stats));
  },
  showDirectoryPicker: () => ipcRenderer.invoke('show-directory-picker'),
  saveHistory: (history) => ipcRenderer.invoke('save-history', history),
  loadHistory: () => ipcRenderer.invoke('load-history'),
  confirmCloseApp: () => ipcRenderer.invoke('confirm-close-app'),
  
  // Blender info handlers
  getBlenderVersion: () => ipcRenderer.invoke('get-blender-version'),
  getRenderEngine: () => ipcRenderer.invoke('get-render-engine'),
  getOutputPath: () => ipcRenderer.invoke('get-output-path'),
  
  // Mobile Companion Server APIs
  mobileServerStart: () => ipcRenderer.invoke('mobile-server-start'),
  mobileServerStop: () => ipcRenderer.invoke('mobile-server-stop'),
  mobileServerStatus: () => ipcRenderer.invoke('mobile-server-status'),
  generatePairingCode: () => ipcRenderer.invoke('generate-pairing-code'),
  clearPairingCode: () => ipcRenderer.invoke('clear-pairing-code'),
  getPairedDevices: () => ipcRenderer.invoke('get-paired-devices'),
  removePairedDevice: (deviceId) => ipcRenderer.invoke('remove-paired-device', deviceId),
  getConnectedDevices: () => ipcRenderer.invoke('get-connected-devices'),
  
  // Mobile Companion Server Event Listeners
  onMobileServerStatus: (callback) => {
    ipcRenderer.on('mobile-server-status', (event, data) => callback(data));
  },
  onDevicePaired: (callback) => {
    ipcRenderer.on('device-paired', (event, data) => callback(data));
  },
  onPairingCodeGenerated: (callback) => {
    ipcRenderer.on('pairing-code-generated', (event, code) => callback(code));
  },
  onPairingCodeCleared: (callback) => {
    ipcRenderer.on('pairing-code-cleared', (event) => callback());
  }
});

console.log('Electron API exposed to window');

// Abilita il drag and drop dei file
window.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.stopPropagation();
});

window.addEventListener('drop', (event) => {
  event.preventDefault();
  event.stopPropagation();
});
