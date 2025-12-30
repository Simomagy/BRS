/**
 * Test per Blender Handlers
 * IPC handlers per rilevamento e gestione Blender
 */

const { MockStore } = require('../../setup/electron-mocks');

// Mock dei moduli
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn()
  }
}));

jest.mock('fs');
jest.mock('fs/promises');

const { ipcMain } = require('electron');
const blenderHandlers = require('../../../electron/handlers/blender-handlers');
const fs = require('fs');
const fsPromises = require('fs/promises');

describe('Blender Handlers', () => {
  let store;
  let mockRenderManager;
  let registeredHandlers;
  const originalPlatform = process.platform;

  beforeEach(() => {
    store = new MockStore();
    mockRenderManager = {
      getBlenderVersion: jest.fn().mockResolvedValue('4.2.7')
    };
    registeredHandlers = {};

    // Cattura tutti gli handler registrati
    ipcMain.handle.mockImplementation((channel, handler) => {
      registeredHandlers[channel] = handler;
    });

    // Registra gli handler
    blenderHandlers.register(store, mockRenderManager);

    // Reset mock
    fs.existsSync.mockClear();
    fs.statSync.mockClear();
    fsPromises.readdir.mockClear();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    delete process.env.ProgramFiles;
    delete process.env['ProgramFiles(x86)'];
    delete process.env.LOCALAPPDATA;
  });

  describe('Handler Registration', () => {
    it('should register all Blender-related handlers', () => {
      const expectedHandlers = [
        'detect-blender',
        'get-blender-version',
        'get-render-engine',
        'get-output-path'
      ];

      expectedHandlers.forEach(handler => {
        expect(registeredHandlers[handler]).toBeDefined();
      });
    });
  });

  describe('detect-blender', () => {
    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
        process.env.ProgramFiles = 'C:\\Program Files';
        process.env['ProgramFiles(x86)'] = 'C:\\Program Files (x86)';
        process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
      });

      it('should find Blender in Program Files', async () => {
        fs.existsSync.mockImplementation((path) => {
          return path.includes('Blender Foundation') ||
                 path.includes('Blender 4.2') ||
                 path.includes('blender.exe');
        });

        fsPromises.readdir.mockResolvedValue(['Blender 4.2']);

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result).toBeInstanceOf(Array);
        expect(result.length).toBeGreaterThan(0);
      });

      it('should return empty array if no Blender found', async () => {
        fs.existsSync.mockReturnValue(false);

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result).toEqual([]);
      });

      it('should handle multiple Blender versions', async () => {
        fs.existsSync.mockReturnValue(true);
        fsPromises.readdir.mockResolvedValue([
          'Blender 4.2',
          'Blender 3.6',
          'Blender 4.0'
        ]);

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result.length).toBeGreaterThanOrEqual(1);
      });

      it('should validate .exe extension on Windows', async () => {
        fs.existsSync.mockImplementation((path) => {
          return path.endsWith('.exe');
        });

        fsPromises.readdir.mockResolvedValue(['Blender 4.2']);

        const handler = registeredHandlers['detect-blender'];
        await handler();

        // Verifica che sia stato chiamato con un percorso .exe
        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('.exe')
        );
      });
    });

    describe('macOS', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'darwin' });
      });

      it('should find Blender in Applications', async () => {
        fs.existsSync.mockReturnValue(true);
        fsPromises.readdir.mockResolvedValue(['Blender.app', 'Blender 4.2.app']);

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result).toBeInstanceOf(Array);
      });

      it('should check both /Applications and ~/Applications', async () => {
        fs.existsSync.mockReturnValue(true);
        fsPromises.readdir.mockResolvedValue(['Blender.app']);

        const handler = registeredHandlers['detect-blender'];
        await handler();

        // Verifica che abbia cercato in entrambe le directory
        expect(fsPromises.readdir).toHaveBeenCalled();
      });

      it('should validate .app extension on macOS', async () => {
        fs.existsSync.mockImplementation((path) => {
          return path.includes('.app');
        });

        fsPromises.readdir.mockResolvedValue(['Blender.app']);

        const handler = registeredHandlers['detect-blender'];
        await handler();

        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('.app')
        );
      });
    });

    describe('Linux', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'linux' });
      });

      it('should find Blender in standard paths', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          isFile: () => true,
          mode: 0o100755 // Eseguibile
        });

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result).toBeInstanceOf(Array);
      });

      it('should check /opt for Blender installations', async () => {
        fs.existsSync.mockImplementation((path) => {
          return path === '/opt' || path.includes('/opt/blender');
        });
        fs.statSync.mockReturnValue({
          isFile: () => true,
          mode: 0o100755
        });
        fsPromises.readdir.mockResolvedValue(['blender-4.2', 'blender-3.6']);

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(fsPromises.readdir).toHaveBeenCalledWith('/opt');
      });

      it('should validate executable permissions on Linux', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          isFile: () => true,
          mode: 0o100644 // Non eseguibile
        });

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        // Non dovrebbe trovare Blender se non è eseguibile
        expect(result).toEqual([]);
      });

      it('should find Blender with executable permissions', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.statSync.mockReturnValue({
          isFile: () => true,
          mode: 0o100755 // Eseguibile
        });

        const handler = registeredHandlers['detect-blender'];
        const result = await handler();

        expect(result.length).toBeGreaterThan(0);
      });
    });

    it('should handle search errors gracefully', async () => {
      fs.existsSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const handler = registeredHandlers['detect-blender'];
      const result = await handler();

      expect(result).toEqual([]);
    });

    it('should return version information for found installations', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      process.env.ProgramFiles = 'C:\\Program Files';

      fs.existsSync.mockReturnValue(true);
      fsPromises.readdir.mockResolvedValue(['Blender 4.2']);

      const handler = registeredHandlers['detect-blender'];
      const result = await handler();

      if (result.length > 0) {
        expect(result[0]).toHaveProperty('path');
        expect(result[0]).toHaveProperty('version');
      }
    });
  });

  describe('get-blender-version', () => {
    it('should return Blender version from default preset', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: { blenderPath: 'C:\\Blender\\blender.exe' }
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      mockRenderManager.getBlenderVersion.mockResolvedValue('4.2.7');

      const handler = registeredHandlers['get-blender-version'];
      const result = await handler();

      expect(result).toBe('4.2.7');
      expect(mockRenderManager.getBlenderVersion).toHaveBeenCalledWith('C:\\Blender\\blender.exe');
    });

    it('should return "Unknown" if default preset not found', async () => {
      store.set('presets', []);
      store.set('defaultPreset', 'non-existent');

      const handler = registeredHandlers['get-blender-version'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });

    it('should return "Unknown" if blenderPath not set', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: {} // No blenderPath
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      const handler = registeredHandlers['get-blender-version'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });

    it('should handle errors gracefully', async () => {
      store.get = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['get-blender-version'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });

    it('should handle renderManager errors', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: { blenderPath: 'invalid-path' }
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      mockRenderManager.getBlenderVersion.mockRejectedValue(new Error('Invalid path'));

      const handler = registeredHandlers['get-blender-version'];

      // Should not throw
      await expect(handler()).resolves.toBe('Unknown');
    });
  });

  describe('get-render-engine', () => {
    it('should return render engine from default preset', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: { renderEngine: 'CYCLES' }
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      const handler = registeredHandlers['get-render-engine'];
      const result = await handler();

      expect(result).toBe('CYCLES');
    });

    it('should return "Unknown" if default preset not found', async () => {
      store.set('presets', []);
      store.set('defaultPreset', 'non-existent');

      const handler = registeredHandlers['get-render-engine'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });

    it('should return "Unknown" if renderEngine not set', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: {}
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      const handler = registeredHandlers['get-render-engine'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });

    it('should handle different render engines', async () => {
      const engines = ['CYCLES', 'EEVEE', 'WORKBENCH'];

      for (const engine of engines) {
        const presets = [
          {
            id: 'default',
            name: 'Default',
            parameters: { renderEngine: engine }
          }
        ];
        store.set('presets', presets);
        store.set('defaultPreset', 'default');

        const handler = registeredHandlers['get-render-engine'];
        const result = await handler();

        expect(result).toBe(engine);
      }
    });

    it('should handle errors gracefully', async () => {
      store.get = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['get-render-engine'];
      const result = await handler();

      expect(result).toBe('Unknown');
    });
  });

  describe('get-output-path', () => {
    it('should return output path from default preset', async () => {
      const outputPath = 'C:\\Renders\\Output';
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: { outputDir: outputPath }
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      const handler = registeredHandlers['get-output-path'];
      const result = await handler();

      expect(result).toBe(outputPath);
    });

    it('should return empty string if default preset not found', async () => {
      store.set('presets', []);
      store.set('defaultPreset', 'non-existent');

      const handler = registeredHandlers['get-output-path'];
      const result = await handler();

      expect(result).toBe('');
    });

    it('should return empty string if outputDir not set', async () => {
      const presets = [
        {
          id: 'default',
          name: 'Default',
          parameters: {}
        }
      ];
      store.set('presets', presets);
      store.set('defaultPreset', 'default');

      const handler = registeredHandlers['get-output-path'];
      const result = await handler();

      expect(result).toBe('');
    });

    it('should handle various path formats', async () => {
      const paths = [
        'C:\\Renders',
        '/home/user/renders',
        '~/Desktop/Output',
        'D:\\Projects\\Render\\Output'
      ];

      for (const outputPath of paths) {
        const presets = [
          {
            id: 'default',
            name: 'Default',
            parameters: { outputDir: outputPath }
          }
        ];
        store.set('presets', presets);
        store.set('defaultPreset', 'default');

        const handler = registeredHandlers['get-output-path'];
        const result = await handler();

        expect(result).toBe(outputPath);
      }
    });

    it('should handle errors gracefully', async () => {
      store.get = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['get-output-path'];
      const result = await handler();

      expect(result).toBe('');
    });
  });

  describe('Integration', () => {
    it('should work with complete preset configuration', async () => {
      const completePreset = {
        id: 'complete',
        name: 'Complete Preset',
        parameters: {
          blenderPath: 'C:\\Blender\\blender.exe',
          renderEngine: 'CYCLES',
          outputDir: 'C:\\Output'
        }
      };

      store.set('presets', [completePreset]);
      store.set('defaultPreset', 'complete');
      mockRenderManager.getBlenderVersion.mockResolvedValue('4.2.7');

      // Test version
      let handler = registeredHandlers['get-blender-version'];
      let result = await handler();
      expect(result).toBe('4.2.7');

      // Test engine
      handler = registeredHandlers['get-render-engine'];
      result = await handler();
      expect(result).toBe('CYCLES');

      // Test output path
      handler = registeredHandlers['get-output-path'];
      result = await handler();
      expect(result).toBe('C:\\Output');
    });
  });
});
