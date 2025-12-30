const { ipcMain } = require('electron');
const fs = require('fs');

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

/**
 * Register all preset-related IPC handlers
 * @param {Store} store - Electron store instance
 */
function register(store) {
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
}

module.exports = { register };
