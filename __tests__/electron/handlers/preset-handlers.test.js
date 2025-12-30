/**
 * Test per Preset Handlers
 * IPC handlers per gestione preset di render
 */

const { MockStore } = require('../../setup/electron-mocks');

// Mock dei moduli
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn()
  }
}));

jest.mock('fs/promises');

const { ipcMain } = require('electron');
const presetHandlers = require('../../../electron/handlers/preset-handlers');
const fsPromises = require('fs/promises');
const { createMockPreset } = require('../../setup/test-utils');

describe('Preset Handlers', () => {
  let store;
  let registeredHandlers;

  beforeEach(() => {
    store = new MockStore();
    registeredHandlers = {};

    // Cattura tutti gli handler registrati
    ipcMain.handle.mockImplementation((channel, handler) => {
      registeredHandlers[channel] = handler;
    });

    // Registra gli handler
    presetHandlers.register(store);

    // Setup mock per fs/promises
    fsPromises.readFile.mockClear();
  });

  describe('Handler Registration', () => {
    it('should register all preset-related handlers', () => {
      const expectedHandlers = [
        'getAllPresets',
        'getPreset',
        'savePreset',
        'deletePreset',
        'renamePreset',
        'importPresets'
      ];

      expectedHandlers.forEach(handler => {
        expect(registeredHandlers[handler]).toBeDefined();
      });
    });
  });

  describe('getAllPresets', () => {
    it('should return empty array when no presets exist', async () => {
      const handler = registeredHandlers['getAllPresets'];
      const result = await handler();

      expect(result).toEqual([]);
    });

    it('should return all presets from store', async () => {
      const presets = [
        createMockPreset({ name: 'Preset 1' }),
        createMockPreset({ name: 'Preset 2' })
      ];
      store.set('presets', presets);

      const handler = registeredHandlers['getAllPresets'];
      const result = await handler();

      expect(result).toHaveLength(2);
      expect(result).toEqual(presets);
    });

    it('should return empty array on error', async () => {
      store.get = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['getAllPresets'];
      const result = await handler();

      expect(result).toEqual([]);
    });
  });

  describe('getPreset', () => {
    it('should return preset by ID', async () => {
      const preset = createMockPreset({ id: 'preset-123' });
      store.set('presets', [preset]);

      const handler = registeredHandlers['getPreset'];
      const result = await handler(null, 'preset-123');

      expect(result).toEqual(preset);
    });

    it('should return null for non-existent preset', async () => {
      store.set('presets', [createMockPreset()]);

      const handler = registeredHandlers['getPreset'];
      const result = await handler(null, 'non-existent');

      expect(result).toBeNull();
    });

    it('should return null on error', async () => {
      store.get = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['getPreset'];
      const result = await handler(null, 'any-id');

      expect(result).toBeNull();
    });

    it('should handle empty presets array', async () => {
      store.set('presets', []);

      const handler = registeredHandlers['getPreset'];
      const result = await handler(null, 'any-id');

      expect(result).toBeNull();
    });
  });

  describe('savePreset', () => {
    it('should add new preset to store', async () => {
      const preset = createMockPreset();

      const handler = registeredHandlers['savePreset'];
      const result = await handler(null, preset);

      expect(result).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(1);
      expect(storedPresets[0]).toEqual(preset);
    });

    it('should update existing preset', async () => {
      const originalPreset = createMockPreset({
        id: 'preset-123',
        name: 'Original'
      });
      store.set('presets', [originalPreset]);

      const updatedPreset = {
        ...originalPreset,
        name: 'Updated',
        settings: { samples: 256 }
      };

      const handler = registeredHandlers['savePreset'];
      const result = await handler(null, updatedPreset);

      expect(result).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(1);
      expect(storedPresets[0].name).toBe('Updated');
      expect(storedPresets[0].settings.samples).toBe(256);
    });

    it('should preserve other presets when updating', async () => {
      const preset1 = createMockPreset({ id: 'preset-1', name: 'Preset 1' });
      const preset2 = createMockPreset({ id: 'preset-2', name: 'Preset 2' });
      store.set('presets', [preset1, preset2]);

      const updatedPreset2 = { ...preset2, name: 'Updated Preset 2' };

      const handler = registeredHandlers['savePreset'];
      await handler(null, updatedPreset2);

      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(2);
      expect(storedPresets[0]).toEqual(preset1);
      expect(storedPresets[1].name).toBe('Updated Preset 2');
    });

    it('should return false on error', async () => {
      store.set = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['savePreset'];
      const result = await handler(null, createMockPreset());

      expect(result).toBe(false);
    });

    it('should handle multiple presets', async () => {
      const presets = [
        createMockPreset({ id: 'p1', name: 'Preset 1' }),
        createMockPreset({ id: 'p2', name: 'Preset 2' }),
        createMockPreset({ id: 'p3', name: 'Preset 3' })
      ];

      const handler = registeredHandlers['savePreset'];

      for (const preset of presets) {
        await handler(null, preset);
      }

      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(3);
    });
  });

  describe('deletePreset', () => {
    it('should remove preset from store', async () => {
      const preset = createMockPreset({ id: 'preset-123' });
      store.set('presets', [preset]);

      const handler = registeredHandlers['deletePreset'];
      const result = await handler(null, 'preset-123');

      expect(result).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(0);
    });

    it('should preserve other presets', async () => {
      const preset1 = createMockPreset({ id: 'p1', name: 'Preset 1' });
      const preset2 = createMockPreset({ id: 'p2', name: 'Preset 2' });
      const preset3 = createMockPreset({ id: 'p3', name: 'Preset 3' });
      store.set('presets', [preset1, preset2, preset3]);

      const handler = registeredHandlers['deletePreset'];
      await handler(null, 'p2');

      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(2);
      expect(storedPresets.find(p => p.id === 'p1')).toBeDefined();
      expect(storedPresets.find(p => p.id === 'p3')).toBeDefined();
      expect(storedPresets.find(p => p.id === 'p2')).toBeUndefined();
    });

    it('should return true even if preset does not exist', async () => {
      store.set('presets', [createMockPreset()]);

      const handler = registeredHandlers['deletePreset'];
      const result = await handler(null, 'non-existent');

      expect(result).toBe(true);
    });

    it('should return false on error', async () => {
      store.set = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['deletePreset'];
      const result = await handler(null, 'any-id');

      expect(result).toBe(false);
    });

    it('should handle empty presets array', async () => {
      store.set('presets', []);

      const handler = registeredHandlers['deletePreset'];
      const result = await handler(null, 'any-id');

      expect(result).toBe(true);
      expect(store.get('presets')).toEqual([]);
    });
  });

  describe('renamePreset', () => {
    it('should update preset name', async () => {
      const preset = createMockPreset({ id: 'p1', name: 'Original Name' });
      store.set('presets', [preset]);

      const handler = registeredHandlers['renamePreset'];
      const result = await handler(null, 'p1', 'New Name');

      expect(result).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets[0].name).toBe('New Name');
    });

    it('should update updatedAt timestamp', async () => {
      const preset = createMockPreset({
        id: 'p1',
        updatedAt: '2024-01-01T00:00:00Z'
      });
      store.set('presets', [preset]);

      const handler = registeredHandlers['renamePreset'];
      await handler(null, 'p1', 'New Name');

      const storedPresets = store.get('presets');
      expect(storedPresets[0].updatedAt).not.toBe('2024-01-01T00:00:00Z');
      expect(new Date(storedPresets[0].updatedAt).getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00Z').getTime()
      );
    });

    it('should return false for non-existent preset', async () => {
      store.set('presets', []);

      const handler = registeredHandlers['renamePreset'];
      const result = await handler(null, 'non-existent', 'New Name');

      expect(result).toBe(false);
    });

    it('should preserve other preset properties', async () => {
      const preset = createMockPreset({
        id: 'p1',
        name: 'Original',
        settings: { samples: 128 }
      });
      store.set('presets', [preset]);

      const handler = registeredHandlers['renamePreset'];
      await handler(null, 'p1', 'New Name');

      const storedPresets = store.get('presets');
      expect(storedPresets[0].id).toBe('p1');
      expect(storedPresets[0].settings).toEqual({ samples: 128 });
    });

    it('should return false on error', async () => {
      store.set = jest.fn(() => {
        throw new Error('Store error');
      });

      const handler = registeredHandlers['renamePreset'];
      const result = await handler(null, 'any-id', 'New Name');

      expect(result).toBe(false);
    });
  });

  describe('importPresets', () => {
    it('should import valid preset from file', async () => {
      const preset = {
        id: 'imported-1',
        name: 'Imported Preset',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameters: { samples: 128 }
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(preset));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'C:\\presets\\import.json');

      expect(result.success).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(1);
      expect(storedPresets[0]).toMatchObject(preset);
    });

    it('should return error for missing file path', async () => {
      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, null);

      expect(result.success).toBe(false);
      expect(result.message).toBe('No file path provided');
    });

    it('should return error for invalid JSON', async () => {
      fsPromises.readFile.mockResolvedValue('{ invalid json }');

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'invalid.json');

      expect(result.success).toBe(false);
      expect(result.message).toBeDefined();
    });

    it('should validate preset structure', async () => {
      const invalidPreset = {
        name: 'Invalid Preset'
        // Missing id, version, createdAt, updatedAt
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(invalidPreset));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'invalid.json');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    it('should rename preset if name already exists', async () => {
      const existingPreset = createMockPreset({ name: 'Duplicate' });
      store.set('presets', [existingPreset]);

      const importedPreset = {
        id: 'new-id',
        name: 'Duplicate',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(importedPreset));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'preset.json');

      expect(result.success).toBe(true);
      const storedPresets = store.get('presets');
      expect(storedPresets).toHaveLength(2);
      expect(storedPresets[1].name).toContain('Duplicate_');
      expect(storedPresets[1].name).not.toBe('Duplicate');
    });

    it('should handle file read errors', async () => {
      fsPromises.readFile.mockRejectedValue(new Error('File not found'));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'nonexistent.json');

      expect(result.success).toBe(false);
      expect(result.message).toContain('File not found');
    });

    it('should validate required fields', async () => {
      const testCases = [
        { id: '', name: 'Test', version: '1.0.0', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: 'test', name: '', version: '1.0.0', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: 'test', name: 'Test', version: '', createdAt: '2024-01-01', updatedAt: '2024-01-01' },
        { id: 'test', name: 'Test', version: '1.0.0', createdAt: '', updatedAt: '2024-01-01' },
        { id: 'test', name: 'Test', version: '1.0.0', createdAt: '2024-01-01', updatedAt: '' }
      ];

      const handler = registeredHandlers['importPresets'];

      for (const testCase of testCases) {
        fsPromises.readFile.mockResolvedValue(JSON.stringify(testCase));
        const result = await handler(null, 'test.json');
        expect(result.success).toBe(false);
      }
    });

    it('should validate parameters type if present', async () => {
      const preset = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        parameters: 'invalid' // Should be object
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(preset));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'test.json');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Parameters');
    });

    it('should validate metadata type if present', async () => {
      const preset = {
        id: 'test',
        name: 'Test',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: 'invalid' // Should be object
      };

      fsPromises.readFile.mockResolvedValue(JSON.stringify(preset));

      const handler = registeredHandlers['importPresets'];
      const result = await handler(null, 'test.json');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Metadata');
    });
  });

  describe('Integration', () => {
    it('should support full CRUD workflow', async () => {
      // Create
      const preset = createMockPreset({ id: 'test-1', name: 'Test Preset' });
      const saveHandler = registeredHandlers['savePreset'];
      await saveHandler(null, preset);

      // Read (single)
      const getHandler = registeredHandlers['getPreset'];
      let retrieved = await getHandler(null, 'test-1');
      expect(retrieved).toEqual(preset);

      // Read (all)
      const getAllHandler = registeredHandlers['getAllPresets'];
      let allPresets = await getAllHandler();
      expect(allPresets).toHaveLength(1);

      // Update (rename)
      const renameHandler = registeredHandlers['renamePreset'];
      await renameHandler(null, 'test-1', 'Renamed Preset');
      retrieved = await getHandler(null, 'test-1');
      expect(retrieved.name).toBe('Renamed Preset');

      // Update (full)
      const updatedPreset = { ...retrieved, settings: { samples: 256 } };
      await saveHandler(null, updatedPreset);
      retrieved = await getHandler(null, 'test-1');
      expect(retrieved.settings.samples).toBe(256);

      // Delete
      const deleteHandler = registeredHandlers['deletePreset'];
      await deleteHandler(null, 'test-1');
      retrieved = await getHandler(null, 'test-1');
      expect(retrieved).toBeNull();

      allPresets = await getAllHandler();
      expect(allPresets).toHaveLength(0);
    });
  });
});
