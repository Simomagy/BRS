const { ipcMain, dialog, shell } = require('electron');

/**
 * Register all file-related IPC handlers
 * @param {BrowserWindow} mainWindow - The main application window
 */
function register(mainWindow) {
  // File system operations
  ipcMain.handle('open-file-dialog', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result.filePaths;
  });

  ipcMain.handle('open-directory', async (event, options) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      ...options,
      properties: ['openDirectory']
    });
    return result.filePaths[0] || null;
  });

  ipcMain.handle('open-path', async (event, dirPath) => {
    try {
      await shell.openPath(dirPath);
      return true;
    } catch (error) {
      console.error('Error opening path:', error);
      return false;
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    try {
      const fs = require('fs').promises;
      const data = await fs.readFile(filePath, 'utf8');
      return data;
    } catch (error) {
      console.error('Error reading file:', error);
      return null;
    }
  });

  ipcMain.handle('write-file', async (event, filePath, data) => {
    try {
      const fs = require('fs').promises;
      await fs.writeFile(filePath, data, 'utf8');
    } catch (error) {
      console.error('Error writing file:', error);
      throw error;
    }
  });

  ipcMain.handle('get-app-data-path', () => {
    const os = require('os');
    const path = require('path');

    switch (process.platform) {
      case 'win32':
        return path.join(os.homedir(), 'AppData', 'Roaming', 'BlenderRenderSuite');
      case 'darwin':
        return path.join(os.homedir(), 'Library', 'Application Support', 'BlenderRenderSuite');
      default:
        return path.join(os.homedir(), '.config', 'blender-render-suite');
    }
  });

  // File existence checker
  ipcMain.handle('file-exists', async (event, filePath) => {
    try {
      const fs = require('fs');
      return fs.existsSync(filePath);
    } catch (error) {
      console.error('Error checking file existence:', error);
      return false;
    }
  });

  // Aggiungi questo handler
  ipcMain.handle('show-directory-picker', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Select Installation Directory'
      });

      if (!result.canceled && result.filePaths.length > 0) {
        return result.filePaths[0];
      }
      return null;
    } catch (error) {
      console.error('Error showing directory picker:', error);
      return null;
    }
  });

  // Read image file as base64 for preview
  ipcMain.handle('read-image-as-base64', async (event, filePath) => {
    try {
      const fs = require('fs');
      const path = require('path');

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.error('Image file does not exist:', filePath);
        return null;
      }

      // Read file as buffer
      const imageBuffer = fs.readFileSync(filePath);

      // Determine mime type from extension
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'image/png';

      switch (ext) {
        case '.jpg':
        case '.jpeg':
          mimeType = 'image/jpeg';
          break;
        case '.png':
          mimeType = 'image/png';
          break;
        case '.exr':
          mimeType = 'image/x-exr';
          break;
        case '.tif':
        case '.tiff':
          mimeType = 'image/tiff';
          break;
        case '.bmp':
          mimeType = 'image/bmp';
          break;
      }

      // Convert to base64
      const base64Image = imageBuffer.toString('base64');
      return `data:${mimeType};base64,${base64Image}`;
    } catch (error) {
      console.error('Error reading image as base64:', error);
      return null;
    }
  });
}

module.exports = { register };
