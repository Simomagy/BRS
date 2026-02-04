/**
 * Mock per Electron APIs
 * Utilizzato nei test per simulare il comportamento di Electron
 */

const EventEmitter = require('events');

// Mock di BrowserWindow
class MockBrowserWindow extends EventEmitter {
  constructor() {
    super();
    this.webContents = {
      send: jest.fn(),
      on: jest.fn(),
      openDevTools: jest.fn(),
      closeDevTools: jest.fn(),
      isDevToolsOpened: jest.fn().mockReturnValue(false)
    };
    this.isDestroyed = jest.fn().mockReturnValue(false);
    this.close = jest.fn();
    this.destroy = jest.fn();
    this.focus = jest.fn();
    this.show = jest.fn();
    this.hide = jest.fn();
    this.loadURL = jest.fn().mockResolvedValue(undefined);
    this.loadFile = jest.fn().mockResolvedValue(undefined);
  }

  static getAllWindows() {
    return [];
  }
}

// Mock di dialog
const mockDialog = {
  showOpenDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePaths: ['C:\\test\\file.blend']
  }),
  showSaveDialog: jest.fn().mockResolvedValue({
    canceled: false,
    filePath: 'C:\\test\\output.png'
  }),
  showMessageBox: jest.fn().mockResolvedValue({
    response: 0,
    checkboxChecked: false
  }),
  showErrorBox: jest.fn()
};

// Mock di shell
const mockShell = {
  openPath: jest.fn().mockResolvedValue(''),
  openExternal: jest.fn().mockResolvedValue(undefined),
  showItemInFolder: jest.fn()
};

// Mock di app
const mockApp = {
  getPath: jest.fn((name) => {
    const paths = {
      home: 'C:\\Users\\TestUser',
      appData: 'C:\\Users\\TestUser\\AppData\\Roaming',
      userData: 'C:\\Users\\TestUser\\AppData\\Roaming\\BRS',
      temp: 'C:\\Temp',
      exe: 'C:\\Program Files\\BRS\\BRS.exe',
      desktop: 'C:\\Users\\TestUser\\Desktop',
      documents: 'C:\\Users\\TestUser\\Documents'
    };
    return paths[name] || 'C:\\';
  }),
  getVersion: jest.fn().mockReturnValue('1.3.0'),
  getName: jest.fn().mockReturnValue('BRS'),
  isPackaged: false,
  quit: jest.fn(),
  exit: jest.fn(),
  relaunch: jest.fn(),
  whenReady: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn()
};

// Mock di ipcMain
const mockIpcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeHandler: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn()
};

// Mock di ipcRenderer
const mockIpcRenderer = {
  invoke: jest.fn().mockResolvedValue(undefined),
  send: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn()
};

// Mock di electron-store
class MockStore {
  constructor() {
    this.store = {};
  }

  get(key, defaultValue) {
    return this.store[key] !== undefined ? this.store[key] : defaultValue;
  }

  set(key, value) {
    this.store[key] = value;
  }

  delete(key) {
    delete this.store[key];
  }

  clear() {
    this.store = {};
  }

  has(key) {
    return key in this.store;
  }

  get size() {
    return Object.keys(this.store).length;
  }
}

// Mock di child_process
const createMockProcess = () => {
  const mockProcess = new EventEmitter();
  mockProcess.pid = Math.floor(Math.random() * 10000) + 1000;
  mockProcess.stdout = new EventEmitter();
  mockProcess.stderr = new EventEmitter();
  mockProcess.stdin = {
    write: jest.fn(),
    end: jest.fn()
  };
  mockProcess.kill = jest.fn((signal) => {
    // Cleanup automatico quando il processo viene killato
    mockProcess.stdout.removeAllListeners();
    mockProcess.stderr.removeAllListeners();
    mockProcess.removeAllListeners();
    return true;
  });

  // Limita i listener per evitare memory warnings
  mockProcess.setMaxListeners(20);
  mockProcess.stdout.setMaxListeners(20);
  mockProcess.stderr.setMaxListeners(20);

  return mockProcess;
};

const mockSpawn = jest.fn(() => createMockProcess());
const mockExec = jest.fn((cmd, callback) => {
  if (callback) callback(null, '', '');
  return createMockProcess();
});
const mockExecSync = jest.fn().mockReturnValue(Buffer.from(''));

// Funzione helper per simulare output Blender
const simulateBlenderOutput = (mockProcess, frames = [1, 2, 3]) => {
  setTimeout(() => {
    mockProcess.stdout.emit('data', Buffer.from('Blender 4.2.7 LTS\n'));

    frames.forEach((frame, index) => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from(
          `Fra:${frame} Mem:150.00M (Peak 200.00M) | Time:00:02.15 | Remaining:00:10.00 | Sample ${index + 1}/64\n`
        ));
      }, (index + 1) * 100);
    });

    setTimeout(() => {
      mockProcess.emit('close', 0);
    }, (frames.length + 1) * 100);
  }, 10);
};

// Funzione helper per simulare errore processo
const simulateProcessError = (mockProcess, errorMessage = 'Render failed') => {
  setTimeout(() => {
    mockProcess.stderr.emit('data', Buffer.from(`Error: ${errorMessage}\n`));
    mockProcess.emit('close', 1);
  }, 10);
};

// Setup globale dei mock
const setupElectronMocks = () => {
  // Mock di electron module
  jest.mock('electron', () => ({
    app: mockApp,
    BrowserWindow: MockBrowserWindow,
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    dialog: mockDialog,
    shell: mockShell
  }));

  // Mock di electron-store
  jest.mock('electron-store', () => MockStore);

  // Mock di child_process
  jest.mock('child_process', () => ({
    spawn: mockSpawn,
    exec: mockExec,
    execSync: mockExecSync
  }));

  // Mock di fs/promises per test file handlers
  jest.mock('fs/promises', () => ({
    readFile: jest.fn().mockResolvedValue('{}'),
    writeFile: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([])
  }));
};

// Reset dei mock tra i test
const resetElectronMocks = () => {
  mockDialog.showOpenDialog.mockClear();
  mockDialog.showSaveDialog.mockClear();
  mockDialog.showMessageBox.mockClear();
  mockDialog.showErrorBox.mockClear();
  mockShell.openPath.mockClear();
  mockShell.openExternal.mockClear();
  mockIpcMain.handle.mockClear();
  mockIpcMain.on.mockClear();
  mockIpcRenderer.invoke.mockClear();
  mockIpcRenderer.send.mockClear();
  mockSpawn.mockClear();
  mockExec.mockClear();
  mockExecSync.mockClear();
};

module.exports = {
  MockBrowserWindow,
  mockDialog,
  mockShell,
  mockApp,
  mockIpcMain,
  mockIpcRenderer,
  MockStore,
  createMockProcess,
  mockSpawn,
  mockExec,
  mockExecSync,
  simulateBlenderOutput,
  simulateProcessError,
  setupElectronMocks,
  resetElectronMocks
};
