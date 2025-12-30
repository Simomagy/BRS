/**
 * Test per File Handlers
 * IPC handlers per operazioni filesystem
 */

const { mockDialog, mockShell, MockBrowserWindow } = require('../../setup/electron-mocks');

// Mock dei moduli
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn()
  },
  dialog: mockDialog,
  shell: mockShell
}));

jest.mock('fs');
jest.mock('fs/promises');

const { ipcMain } = require('electron');
const fileHandlers = require('../../../electron/handlers/file-handlers');
const fs = require('fs');
const fsPromises = require('fs/promises');

describe('File Handlers', () => {
  let mainWindow;
  let registeredHandlers;

  beforeEach(() => {
    mainWindow = new MockBrowserWindow();
    registeredHandlers = {};

    // Cattura tutti gli handler registrati
    ipcMain.handle.mockImplementation((channel, handler) => {
      registeredHandlers[channel] = handler;
    });

    // Registra gli handler
    fileHandlers.register(mainWindow);

    // Reset mock
    mockDialog.showOpenDialog.mockClear();
    mockShell.openPath.mockClear();
  });

  describe('Handler Registration', () => {
    it('should register all file-related handlers', () => {
      const expectedHandlers = [
        'open-file-dialog',
        'open-directory',
        'open-path',
        'read-file',
        'write-file',
        'get-app-data-path',
        'file-exists',
        'show-directory-picker'
      ];

      expectedHandlers.forEach(handler => {
        expect(registeredHandlers[handler]).toBeDefined();
      });
    });
  });

  describe('open-file-dialog', () => {
    it('should call dialog.showOpenDialog with correct parameters', async () => {
      const options = {
        title: 'Select File',
        filters: [{ name: 'Blender Files', extensions: ['blend'] }]
      };

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\test\\file.blend']
      });

      const handler = registeredHandlers['open-file-dialog'];
      await handler(null, options);

      expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, options);
    });

    it('should return selected file paths', async () => {
      const filePaths = ['C:\\test\\file1.blend', 'C:\\test\\file2.blend'];
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths
      });

      const handler = registeredHandlers['open-file-dialog'];
      const result = await handler(null, {});

      expect(result).toEqual(filePaths);
    });

    it('should return empty array when dialog is canceled', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const handler = registeredHandlers['open-file-dialog'];
      const result = await handler(null, {});

      expect(result).toEqual([]);
    });
  });

  describe('open-directory', () => {
    it('should add openDirectory property to options', async () => {
      const options = { title: 'Select Directory' };

      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\test\\directory']
      });

      const handler = registeredHandlers['open-directory'];
      await handler(null, options);

      expect(mockDialog.showOpenDialog).toHaveBeenCalledWith(mainWindow, {
        ...options,
        properties: ['openDirectory']
      });
    });

    it('should return first selected directory', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\test\\directory']
      });

      const handler = registeredHandlers['open-directory'];
      const result = await handler(null, {});

      expect(result).toBe('C:\\test\\directory');
    });

    it('should return null when dialog is canceled', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const handler = registeredHandlers['open-directory'];
      const result = await handler(null, {});

      expect(result).toBeNull();
    });

    it('should return null when no directory selected', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      const handler = registeredHandlers['open-directory'];
      const result = await handler(null, {});

      expect(result).toBeNull();
    });
  });

  describe('open-path', () => {
    it('should call shell.openPath with correct path', async () => {
      const dirPath = 'C:\\test\\directory';
      mockShell.openPath.mockResolvedValue('');

      const handler = registeredHandlers['open-path'];
      await handler(null, dirPath);

      expect(mockShell.openPath).toHaveBeenCalledWith(dirPath);
    });

    it('should return true on success', async () => {
      mockShell.openPath.mockResolvedValue('');

      const handler = registeredHandlers['open-path'];
      const result = await handler(null, 'C:\\test');

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      mockShell.openPath.mockRejectedValue(new Error('Path not found'));

      const handler = registeredHandlers['open-path'];
      const result = await handler(null, 'C:\\invalid');

      expect(result).toBe(false);
    });
  });

  describe('read-file', () => {
    it('should read file with utf8 encoding', async () => {
      const filePath = 'C:\\test\\file.txt';
      const fileContent = 'Test content';

      fsPromises.readFile.mockResolvedValue(fileContent);

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, filePath);

      expect(fsPromises.readFile).toHaveBeenCalledWith(filePath, 'utf8');
      expect(result).toBe(fileContent);
    });

    it('should return file content as string', async () => {
      const content = '{"key": "value"}';
      fsPromises.readFile.mockResolvedValue(content);

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, 'test.json');

      expect(result).toBe(content);
    });

    it('should return null on error', async () => {
      fsPromises.readFile.mockRejectedValue(new Error('File not found'));

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, 'nonexistent.txt');

      expect(result).toBeNull();
    });

    it('should handle empty files', async () => {
      fsPromises.readFile.mockResolvedValue('');

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, 'empty.txt');

      expect(result).toBe('');
    });
  });

  describe('write-file', () => {
    it('should write file with utf8 encoding', async () => {
      const filePath = 'C:\\test\\output.txt';
      const data = 'Content to write';

      fsPromises.writeFile.mockResolvedValue();

      const handler = registeredHandlers['write-file'];
      await handler(null, filePath, data);

      expect(fsPromises.writeFile).toHaveBeenCalledWith(filePath, data, 'utf8');
    });

    it('should write JSON data', async () => {
      const data = JSON.stringify({ key: 'value' });
      fsPromises.writeFile.mockResolvedValue();

      const handler = registeredHandlers['write-file'];
      await handler(null, 'data.json', data);

      expect(fsPromises.writeFile).toHaveBeenCalledWith('data.json', data, 'utf8');
    });

    it('should throw error on write failure', async () => {
      const error = new Error('Permission denied');
      fsPromises.writeFile.mockRejectedValue(error);

      const handler = registeredHandlers['write-file'];

      await expect(handler(null, 'protected.txt', 'data')).rejects.toThrow('Permission denied');
    });

    it('should handle empty content', async () => {
      fsPromises.writeFile.mockResolvedValue();

      const handler = registeredHandlers['write-file'];
      await handler(null, 'empty.txt', '');

      expect(fsPromises.writeFile).toHaveBeenCalledWith('empty.txt', '', 'utf8');
    });
  });

  describe('get-app-data-path', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return Windows path on win32', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const handler = registeredHandlers['get-app-data-path'];
      const result = handler();

      expect(result).toContain('AppData');
      expect(result).toContain('Roaming');
      expect(result).toContain('BlenderRenderSuite');
    });

    it('should return macOS path on darwin', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const handler = registeredHandlers['get-app-data-path'];
      const result = handler();

      expect(result).toContain('Library');
      expect(result).toContain('Application Support');
      expect(result).toContain('BlenderRenderSuite');
    });

    it('should return Linux path on linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const handler = registeredHandlers['get-app-data-path'];
      const result = handler();

      expect(result).toContain('.config');
      expect(result).toContain('blender-render-suite');
    });

    it('should use home directory as base', () => {
      const handler = registeredHandlers['get-app-data-path'];
      const result = handler();

      // Il path dovrebbe contenere una parte dell'home directory
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('file-exists', () => {
    it('should check if file exists', async () => {
      const filePath = 'C:\\test\\file.txt';
      fs.existsSync.mockReturnValue(true);

      const handler = registeredHandlers['file-exists'];
      const result = await handler(null, filePath);

      expect(fs.existsSync).toHaveBeenCalledWith(filePath);
      expect(result).toBe(true);
    });

    it('should return true for existing file', async () => {
      fs.existsSync.mockReturnValue(true);

      const handler = registeredHandlers['file-exists'];
      const result = await handler(null, 'existing.txt');

      expect(result).toBe(true);
    });

    it('should return false for non-existing file', async () => {
      fs.existsSync.mockReturnValue(false);

      const handler = registeredHandlers['file-exists'];
      const result = await handler(null, 'nonexistent.txt');

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('Access denied');
      });

      const handler = registeredHandlers['file-exists'];
      const result = await handler(null, 'protected.txt');

      expect(result).toBe(false);
    });
  });

  describe('show-directory-picker', () => {
    it('should show directory picker with correct options', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['C:\\test\\selected']
      });

      const handler = registeredHandlers['show-directory-picker'];
      await handler();

      expect(mockDialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Installation Directory'
      });
    });

    it('should return selected directory path', async () => {
      const dirPath = 'C:\\Program Files\\BRS';
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: [dirPath]
      });

      const handler = registeredHandlers['show-directory-picker'];
      const result = await handler();

      expect(result).toBe(dirPath);
    });

    it('should return null when dialog is canceled', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: true,
        filePaths: []
      });

      const handler = registeredHandlers['show-directory-picker'];
      const result = await handler();

      expect(result).toBeNull();
    });

    it('should return null when no directory selected', async () => {
      mockDialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      const handler = registeredHandlers['show-directory-picker'];
      const result = await handler();

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      mockDialog.showOpenDialog.mockRejectedValue(new Error('Dialog error'));

      const handler = registeredHandlers['show-directory-picker'];
      const result = await handler();

      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent file operations', async () => {
      fsPromises.readFile.mockResolvedValue('content');

      const handler = registeredHandlers['read-file'];

      // Esegui operazioni concorrenti
      const results = await Promise.all([
        handler(null, 'file1.txt'),
        handler(null, 'file2.txt'),
        handler(null, 'file3.txt')
      ]);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toBe('content');
      });
    });

    it('should handle special characters in file paths', async () => {
      const specialPath = 'C:\\test\\folder with spaces\\file (1).txt';
      fsPromises.readFile.mockResolvedValue('content');

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, specialPath);

      expect(fsPromises.readFile).toHaveBeenCalledWith(specialPath, 'utf8');
      expect(result).toBe('content');
    });

    it('should handle Unicode file paths', async () => {
      const unicodePath = 'C:\\test\\文件\\файл.txt';
      fsPromises.readFile.mockResolvedValue('content');

      const handler = registeredHandlers['read-file'];
      const result = await handler(null, unicodePath);

      expect(result).toBe('content');
    });
  });
});
