const { ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Funzione per verificare se un percorso è un eseguibile Blender valido
async function isValidBlenderExecutable(executablePath) {
  try {
    // Verifica che il file esista
    if (!fs.existsSync(executablePath)) {
      return false;
    }

    // Verifica che sia un file eseguibile
    if (os.platform() === 'win32') {
      return executablePath.toLowerCase().endsWith('.exe');
    } else if (os.platform() === 'darwin') {
      return executablePath.toLowerCase().endsWith('.app');
    } else {
      // Linux
      const stats = fs.statSync(executablePath);
      return stats.isFile() && (stats.mode & fs.constants.S_IXUSR);
    }
  } catch (error) {
    console.error('Error checking Blender executable:', error);
    return false;
  }
}

// Funzione per cercare Blender nelle posizioni standard
async function findBlenderInStandardLocations() {
  const versions = [];

  if (os.platform() === 'win32') {
    // Windows
    const programFiles = process.env['ProgramFiles'];
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    const localAppData = process.env['LOCALAPPDATA'];

    // Funzione per cercare in una directory
    const searchInDirectory = async (baseDir) => {
      try {
        if (!fs.existsSync(baseDir)) return [];

        const blenderDir = path.join(baseDir, 'Blender Foundation');
        if (!fs.existsSync(blenderDir)) return [];

        const entries = await fs.promises.readdir(blenderDir);
        const blenderVersions = entries.filter(entry => entry.startsWith('Blender'));

        for (const version of blenderVersions) {
          const blenderPath = path.join(blenderDir, version, 'blender.exe');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: version.replace('Blender ', '')
            });
          }
        }
      } catch (error) {
        console.error('Error searching in directory:', error);
      }
    };

    // Cerca in Program Files
    if (programFiles) {
      await searchInDirectory(programFiles);
    }

    // Cerca in Program Files (x86)
    if (programFilesX86) {
      await searchInDirectory(programFilesX86);
    }

    // Cerca in AppData locale
    if (localAppData) {
      const blenderDir = path.join(localAppData, 'Programs', 'Blender');
      if (fs.existsSync(blenderDir)) {
        const entries = await fs.promises.readdir(blenderDir);
        for (const entry of entries) {
          const blenderPath = path.join(blenderDir, entry, 'blender.exe');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: entry
            });
          }
        }
      }
    }
  } else if (os.platform() === 'darwin') {
    // macOS
    const searchPaths = [
      '/Applications',
      path.join(os.homedir(), 'Applications')
    ];

    for (const basePath of searchPaths) {
      try {
        if (!fs.existsSync(basePath)) continue;

        const entries = await fs.promises.readdir(basePath);
        const blenderApps = entries.filter(entry => entry.startsWith('Blender'));

        for (const app of blenderApps) {
          const blenderPath = path.join(basePath, app, 'Contents', 'MacOS', 'Blender');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: app.replace('Blender', '').trim()
            });
          }
        }
      } catch (error) {
        console.error('Error searching in directory:', error);
      }
    }
  } else {
    // Linux
    const searchPaths = [
      '/usr/bin',
      '/usr/local/bin',
      path.join(os.homedir(), '.local/bin')
    ];

    // Prima cerca nei percorsi standard
    for (const searchPath of searchPaths) {
      const blenderPath = path.join(searchPath, 'blender');
      if (await isValidBlenderExecutable(blenderPath)) {
        versions.push({
          path: blenderPath,
          version: 'System'
        });
      }
    }

    // Poi cerca in /opt
    try {
      if (fs.existsSync('/opt')) {
        const entries = await fs.promises.readdir('/opt');
        const blenderDirs = entries.filter(entry => entry.startsWith('blender'));

        for (const dir of blenderDirs) {
          const blenderPath = path.join('/opt', dir, 'blender');
          if (await isValidBlenderExecutable(blenderPath)) {
            versions.push({
              path: blenderPath,
              version: dir.replace('blender', '').trim()
            });
          }
        }
      }
    } catch (error) {
      console.error('Error searching in /opt:', error);
    }
  }

  return versions;
}

/**
 * Register all Blender-related IPC handlers
 * @param {Store} store - Electron store instance
 * @param {RenderManager} renderManager - Render manager instance
 */
function register(store, renderManager) {
  // Handler per il rilevamento automatico di Blender
  ipcMain.handle('detect-blender', async () => {
    try {
      const versions = await findBlenderInStandardLocations();
      return versions;
    } catch (error) {
      console.error('Error detecting Blender:', error);
      return [];
    }
  });

  // Blender info handlers
  ipcMain.handle('get-blender-version', async () => {
    try {
      const presets = store.get('presets', []);
      const defaultPresetId = store.get('defaultPreset', 'default');
      const defaultPreset = presets.find(p => p.id === defaultPresetId);

      if (!defaultPreset) return 'Unknown';

      return defaultPreset.parameters.blenderPath ?
        await renderManager.getBlenderVersion(defaultPreset.parameters.blenderPath) :
        'Unknown';
    } catch (error) {
      console.error('Error getting Blender version:', error);
      return 'Unknown';
    }
  });

  ipcMain.handle('get-render-engine', async () => {
    try {
      const presets = store.get('presets', []);
      const defaultPresetId = store.get('defaultPreset', 'default');
      const defaultPreset = presets.find(p => p.id === defaultPresetId);

      if (!defaultPreset) return 'Unknown';

      return defaultPreset.parameters.renderEngine || 'Unknown';
    } catch (error) {
      console.error('Error getting render engine:', error);
      return 'Unknown';
    }
  });

  ipcMain.handle('get-output-path', async () => {
    try {
      const presets = store.get('presets', []);
      const defaultPresetId = store.get('defaultPreset', 'default');
      const defaultPreset = presets.find(p => p.id === defaultPresetId);

      if (!defaultPreset) return '';

      return defaultPreset.parameters.outputDir || '';
    } catch (error) {
      console.error('Error getting output path:', error);
      return '';
    }
  });
}

module.exports = { register };
