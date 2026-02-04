const { BrowserWindow } = require('electron');
const path = require('path');

let renderOutputWindow = null;

/**
 * Create or focus the Render Output window
 * @param {Object} dependencies - Dependencies object containing mainWindow
 * @returns {BrowserWindow} The render output window instance
 */
function createRenderOutputWindow(dependencies) {
  const { mainWindow } = dependencies;

  // If window already exists, focus it
  if (renderOutputWindow && !renderOutputWindow.isDestroyed()) {
    renderOutputWindow.focus();
    return renderOutputWindow;
  }

  // Create new window
  renderOutputWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Render Output',
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true
    },
    autoHideMenuBar: true,
    parent: mainWindow,
  });

  // Load the render output page using query parameter to avoid Next.js routing issues
  const { app } = require('electron');
  const isDev = !app.isPackaged;
  const pageUrl = isDev
    ? 'http://localhost:3000/?window=render-output'
    : `file://${path.join(__dirname, '..', '..', 'out', 'index.html')}?window=render-output`;

  console.log('[Render Output Window] Loading URL:', pageUrl, '(isDev:', isDev, ')');
  renderOutputWindow.loadURL(pageUrl);

  // Show window when ready
  renderOutputWindow.once('ready-to-show', () => {
    renderOutputWindow.show();
  });

  // Clean up reference when closed
  renderOutputWindow.on('closed', () => {
    renderOutputWindow = null;
  });

  // Open DevTools in development
  if (isDev) {
    renderOutputWindow.webContents.openDevTools();
  }

  return renderOutputWindow;
}

/**
 * Get the current render output window instance
 * @returns {BrowserWindow|null}
 */
function getRenderOutputWindow() {
  if (renderOutputWindow && !renderOutputWindow.isDestroyed()) {
    return renderOutputWindow;
  }
  return null;
}

/**
 * Close the render output window if it exists
 */
function closeRenderOutputWindow() {
  if (renderOutputWindow && !renderOutputWindow.isDestroyed()) {
    renderOutputWindow.close();
  }
}

/**
 * Send data to render output window
 * @param {string} channel - IPC channel name
 * @param {any} data - Data to send
 */
function sendToRenderOutputWindow(channel, data) {
  const window = getRenderOutputWindow();
  if (window && !window.isDestroyed() && window.webContents) {
    window.webContents.send(channel, data);
  }
}

module.exports = {
  createRenderOutputWindow,
  getRenderOutputWindow,
  closeRenderOutputWindow,
  sendToRenderOutputWindow
};
