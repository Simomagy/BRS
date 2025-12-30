const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script is running');

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
    return await ipcRenderer.invoke('stopProcess', id);
  },
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
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
