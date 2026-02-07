// Load environment variables from .env file FIRST
require('dotenv').config();

const { Server } = require('socket.io');
const { createServer } = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const winston = require('winston');
const crypto = require('crypto');
const { EventEmitter } = require('events');
// Firebase removed - now using external API proxy

class MobileCompanionServer extends EventEmitter {
  constructor(renderManager, store, options = {}) {
    super();
    this.renderManager = renderManager;
    this.store = store;
    this.mainWindow = options.mainWindow || null;
    this.server = null;
    this.io = null;
    this.httpServer = null;
    this.app = null;
    this.port = 8080;
    this.isRunning = false;

    // Pairing system
    this.currentPairingCode = null;
    this.pairingCodeExpiry = null;
    this.pairedDevices = new Map(); // deviceId -> { name, connectedAt, lastSeen }
    this.connectedClients = new Map(); // socketId -> { deviceId, socket }

    // Push notifications via external API
    this.deviceTokens = new Map(); // deviceId -> fcmToken
    this.apiEndpoint = 'https://brs.api.nebulastudio.dev';

    // Setup logger
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message }) => {
          return `${timestamp} [Mobile Companion] ${level}: ${message}`;
        })
      ),
      transports: [
        new winston.transports.Console()
      ]
    });

    this.setupExpress();
    this.loadPairedDevices();
    this.loadDeviceTokens();
  }

  /**
   * Test API connectivity for push notifications
   */
  async testApiConnectivity() {
    try {
      console.log('🔧 TESTING API CONNECTIVITY:');
      console.log('  - API Endpoint:', this.apiEndpoint);

      const response = await fetch(`${this.apiEndpoint}/api/health`);
      const data = await response.json();

      if (response.ok) {
        this.logger.info('API connectivity test successful - push notifications enabled');
        return true;
      } else {
        console.log('❌ API connection failed:', response.status, response.statusText);
        this.logger.warn('API connectivity test failed');
        return false;
      }
    } catch (error) {
      console.log('❌ API connectivity test FAILED!');
      console.log('🔍 Error details:', error.message);
      this.logger.error(`Failed to connect to API: ${error.message}`);
      return false;
    }
  }

  /**
   * Send push notification to a specific device via API
   */
  async sendPushNotification(deviceId, notification) {

    const token = this.deviceTokens.get(deviceId);

    if (!token) {
      this.logger.warn(`No FCM token found for device ${deviceId}`);
      return false;
    }

    try {
      const payload = {
        token: token,
        title: notification.title,
        body: notification.body,
        data: notification.data || {}
      };

      const response = await fetch(`${this.apiEndpoint}/api/notifications/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        this.logger.info(`Push notification sent successfully: ${result.messageId}`);
        return true;
      } else {
        this.logger.error(`Failed to send push notification via API: ${result.error}`);

        // If token is invalid, remove it
        if (result.error && result.error.includes('registration-token-not-registered')) {
          this.logger.info(`Removing invalid token for device ${deviceId}`);
          this.deviceTokens.delete(deviceId);
          this.saveDeviceTokens();
        }

        return false;
      }
    } catch (error) {
      this.logger.error(`Failed to send push notification via API: ${error.message}`);
      return false;
    }
  }

  /**
   * Send push notification to all connected devices via API
   */
  async broadcastPushNotification(notification) {
    if (this.deviceTokens.size === 0) {
      return 0;
    }

    try {
      // Get all tokens
      const tokens = Array.from(this.deviceTokens.values());

      const payload = {
        tokens: tokens,
        title: notification.title,
        body: notification.body,
        data: notification.data || {}
      };

      const response = await fetch(`${this.apiEndpoint}/api/notifications/broadcast`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (response.ok) {
        this.logger.info(`Broadcast push notification sent to ${result.successCount}/${tokens.length} devices`);
        return result.successCount;
      } else {
        this.logger.error(`Failed to broadcast push notification via API: ${result.error}`);
        return 0;
      }
    } catch (error) {
      this.logger.error(`Failed to broadcast push notification via API: ${error.message}`);
      return 0;
    }
  }

  /**
   * Save device tokens to persistent storage
   */
  saveDeviceTokens() {
    try {
      const tokens = Object.fromEntries(this.deviceTokens);
      this.store.set('deviceTokens', tokens);
    } catch (error) {
      this.logger.error(`Error saving device tokens: ${error.message}`);
    }
  }

  /**
   * Load device tokens from persistent storage
   */
  loadDeviceTokens() {
    try {
      const tokens = this.store.get('deviceTokens', {});
      this.deviceTokens = new Map(Object.entries(tokens));
      this.logger.info(`Loaded ${this.deviceTokens.size} device tokens`);
    } catch (error) {
      this.logger.error(`Error loading device tokens: ${error.message}`);
    }
  }

  setupExpress() {
    this.app = express();

    // Add logging middleware to see all incoming requests
    this.app.use((req, res, next) => {
      next();
    });

    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for development
      crossOriginEmbedderPolicy: false
    }));

    this.app.use(cors({
      origin: "*", // Allow all origins for LAN connections
      methods: ["GET", "POST"],
      credentials: false
    }));

    this.app.use(express.json());

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        server: 'Mobile Companion',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      });
    });

    // Pairing code endpoint
    this.app.get('/api/pairing-code', (req, res) => {
      if (!this.currentPairingCode || Date.now() > this.pairingCodeExpiry) {
        res.status(404).json({ error: 'No active pairing code' });
        return;
      }

      res.json({
        code: this.currentPairingCode,
        expiresAt: this.pairingCodeExpiry
      });
    });

    // File browsing API endpoints
    this.setupFileAPI();

    // Create HTTP server
    this.httpServer = createServer(this.app);
  }

  setupFileAPI() {
    const fs = require('fs');
    const path = require('path');

    // Browse directory contents
    this.app.get('/api/browse', async (req, res) => {
      try {
        const { path: dirPath, filter } = req.query;
        const os = require('os');

        // If no path specified, show system drives on Windows or root on Unix
        let targetPath;
        if (!dirPath) {
          if (process.platform === 'win32') {
            // On Windows, show available drives
            const drives = [];
            for (let i = 65; i <= 90; i++) { // A-Z
              const driveLetter = String.fromCharCode(i);
              const drivePath = `${driveLetter}:\\`;
              if (fs.existsSync(drivePath)) {
                drives.push({
                  name: `${driveLetter}: Drive`,
                  path: drivePath,
                  type: 'drive',
                  size: 0,
                  modified: new Date().toISOString()
                });
              }
            }

            // Add common folders
            const homeDir = os.homedir();
            const commonFolders = [
              { name: 'Desktop', path: path.join(homeDir, 'Desktop') },
              { name: 'Documents', path: path.join(homeDir, 'Documents') },
              { name: 'Downloads', path: path.join(homeDir, 'Downloads') },
            ];

            const result = {
              currentPath: 'Computer',
              parentPath: null,
              items: [
                ...drives,
                ...commonFolders.filter(folder => fs.existsSync(folder.path)).map(folder => ({
                  name: folder.name,
                  path: folder.path,
                  type: 'directory',
                  size: 0,
                  modified: fs.statSync(folder.path).mtime.toISOString()
                }))
              ]
            };

            return res.json(result);
          } else {
            // On Unix-like systems, start from root
            targetPath = '/';
          }
        } else {
          targetPath = dirPath;
        }

        if (!fs.existsSync(targetPath)) {
          return res.status(404).json({ error: 'Path not found' });
        }

        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Path is not a directory' });
        }

        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const result = {
          currentPath: targetPath,
          parentPath: path.dirname(targetPath),
          items: []
        };

        for (const item of items) {
          try {
            const itemPath = path.join(targetPath, item.name);
            const itemStats = fs.statSync(itemPath);

            const fileInfo = {
              name: item.name,
              path: itemPath,
              type: item.isDirectory() ? 'directory' : 'file',
              size: itemStats.size,
              modified: itemStats.mtime.toISOString()
            };

            // Apply filter if specified
            if (filter) {
              if (filter === 'blend' && !item.isDirectory() && !item.name.toLowerCase().endsWith('.blend')) {
                continue;
              }
              if (filter === 'directories' && !item.isDirectory()) {
                continue;
              }
            }

            result.items.push(fileInfo);
          } catch (error) {
            // Skip files we can't access
            continue;
          }
        }

        // Sort: directories first, then files, alphabetically
        result.items.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === 'directory' ? -1 : 1;
          }
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        res.json(result);
      } catch (error) {
        this.logger.error('Browse API error:', error);
        res.status(500).json({ error: 'Failed to browse directory' });
      }
    });

    // Get recent blend files
    this.app.get('/api/recent-files', async (req, res) => {
      try {
        const presets = await this.store.get('presets', []);
        const recentFiles = new Set();

        // Extract blend files from presets
        presets.forEach(preset => {
          if (preset.parameters?.blend_file) {
            recentFiles.add(preset.parameters.blend_file);
          }
        });

        // Get recent files from history (if available)
        const history = await this.store.get('fileHistory', []);
        history.forEach(file => {
          if (file.path && file.path.toLowerCase().endsWith('.blend')) {
            recentFiles.add(file.path);
          }
        });

        const result = Array.from(recentFiles)
          .filter(filePath => fs.existsSync(filePath))
          .map(filePath => {
            const stats = fs.statSync(filePath);
            return {
              name: path.basename(filePath),
              path: filePath,
              directory: path.dirname(filePath),
              size: stats.size,
              modified: stats.mtime.toISOString()
            };
          })
          .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime())
          .slice(0, 20); // Limit to 20 recent files

        res.json(result);
      } catch (error) {
        this.logger.error('Recent files API error:', error);
        res.status(500).json({ error: 'Failed to get recent files' });
      }
    });

    // Get all presets
    this.app.get('/api/presets', async (req, res) => {
      try {
        const presets = await this.store.get('presets', []);
        res.json(presets);
      } catch (error) {
        this.logger.error('Presets API error:', error);
        res.status(500).json({ error: 'Failed to get presets' });
      }
    });

    // Get specific preset
    this.app.get('/api/presets/:id', async (req, res) => {
      try {
        const presets = await this.store.get('presets', []);
        const preset = presets.find(p => p.id === req.params.id);

        if (!preset) {
          return res.status(404).json({ error: 'Preset not found' });
        }

        res.json(preset);
      } catch (error) {
        this.logger.error('Preset API error:', error);
        res.status(500).json({ error: 'Failed to get preset' });
      }
    });

    // Generate command from parameters
    this.app.post('/api/generate-command', async (req, res) => {
      try {
        const { parameters } = req.body;

        if (!parameters || !parameters.blender_path) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const command = await this.generateBlenderCommand(parameters);
        res.json({ command });
      } catch (error) {
        this.logger.error('Generate command API error:', error);
        res.status(500).json({ error: 'Failed to generate command' });
      }
    });

    // Get Blender installations
    this.app.get('/api/blender-paths', async (req, res) => {
      try {
        const blenderPaths = await this.findBlenderInstallations();
        res.json(blenderPaths);
      } catch (error) {
        this.logger.error('Blender paths API error:', error);
        res.status(500).json({ error: 'Failed to find Blender installations' });
      }
    });

    // Save/Update preset
    this.app.post('/api/presets', async (req, res) => {
      try {
        const { preset } = req.body;

        if (!preset || !preset.name) {
          return res.status(400).json({ error: 'Invalid preset data' });
        }

        // Get current presets
        const presets = await this.store.get('presets', []);

        let updatedPresets;
        if (preset.id && presets.find(p => p.id === preset.id)) {
          // Update existing preset - maintain exact order and structure
          const existingPreset = presets.find(p => p.id === preset.id);
          const updatedPreset = {
            id: preset.id,
            name: preset.name,
            version: preset.version || '1.0.0',
            createdAt: existingPreset.createdAt, // Keep original createdAt
            updatedAt: new Date().toISOString(),
            parameters: preset.parameters || {},
            metadata: {
              blenderVersion: preset.parameters?.blender_path || 'Unknown',
              renderEngine: preset.parameters?.render_engine || 'Unknown',
              lastUsed: new Date().toISOString()
            }
          };
          updatedPresets = presets.map(p => p.id === preset.id ? updatedPreset : p);
        } else {
          // Create new preset - exact order and structure as working preset
          const newPreset = {
            id: preset.id || require('crypto').randomUUID(),
            name: preset.name,
            version: preset.version || '1.0.0',
            createdAt: preset.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            parameters: preset.parameters || {},
            metadata: {
              blenderVersion: preset.parameters?.blender_path || 'Unknown',
              renderEngine: preset.parameters?.render_engine || 'Unknown',
              lastUsed: new Date().toISOString()
            }
          };
          updatedPresets = [...presets, newPreset];
        }

        // Save to store
        await this.store.set('presets', updatedPresets);

        const savedPreset = updatedPresets[updatedPresets.length - 1];

        // Emit event to update UI
        this.emit('preset-saved', {
          preset: savedPreset,
          isNew: !preset.id || !presets.find(p => p.id === preset.id)
        });

        this.logger.info(`Preset ${savedPreset.id} saved via API`);

        res.json({ success: true, preset: savedPreset });
      } catch (error) {
        this.logger.error('Save preset API error:', error);
        res.status(500).json({ error: 'Failed to save preset' });
      }
    });

    // Delete preset
    this.app.delete('/api/presets/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const presets = await this.store.get('presets', []);
        const deletedPreset = presets.find(p => p.id === id);
        const updatedPresets = presets.filter(p => p.id !== id);

        await this.store.set('presets', updatedPresets);

        // Emit event to update UI
        if (deletedPreset) {
          this.emit('preset-deleted', { presetId: id, preset: deletedPreset });
          this.logger.info(`Preset ${id} deleted via API`);
        }

        res.json({ success: true });
      } catch (error) {
        this.logger.error('Delete preset API error:', error);
        res.status(500).json({ error: 'Failed to delete preset' });
      }
    });

    // Get render history
    this.app.get('/api/history', async (req, res) => {
      try {
        const history = await this.store.get('renderHistory', []);
        res.json(history);
      } catch (error) {
        this.logger.error('History API error:', error);
        res.status(500).json({ error: 'Failed to get history' });
      }
    });

    // Delete history entry
    this.app.delete('/api/history/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const history = await this.store.get('renderHistory', []);
        const updatedHistory = history.filter(h => h.id !== id);

        await this.store.set('renderHistory', updatedHistory);

        res.json({ success: true });
      } catch (error) {
        this.logger.error('Delete history API error:', error);
        res.status(500).json({ error: 'Failed to delete history entry' });
      }
    });

    // Clear all history
    this.app.delete('/api/history', async (req, res) => {
      try {
        await this.store.set('renderHistory', []);
        res.json({ success: true });
      } catch (error) {
        this.logger.error('Clear history API error:', error);
        res.status(500).json({ error: 'Failed to clear history' });
      }
    });

    // Execute render command (for Blender addon integration)
    this.app.post('/api/render/execute', async (req, res) => {
      try {
        const { command, autoStart = true } = req.body;

        if (!command || typeof command !== 'string') {
          return res.status(400).json({ error: 'Invalid command parameter' });
        }

        this.logger.info('Render execute request received from external source');
        this.logger.info(`Command: ${command.substring(0, 100)}...`);

        // Check if already rendering
        if (this.renderManager.hasActiveRenders()) {
          this.logger.warn('Render already in progress, rejecting new request');
          return res.status(409).json({
            error: 'Render already in progress',
            activeProcesses: this.renderManager.getActiveProcesses()
          });
        }

        if (!autoStart) {
          // Just return success without starting
          return res.json({
            success: true,
            message: 'Command validated but not started',
            command: command
          });
        }

        // Start render using render manager
        // Create a sender that broadcasts to mobile clients AND sends to main window
        const processId = await this.renderManager.startRender(command, {
          send: (event, data) => {
            // Broadcast progress to all connected mobile clients
            this.broadcastToClients('render-progress', { event, data });

            // Also send to main window for UI updates
            if (this.mainWindow && this.mainWindow.webContents) {
              this.mainWindow.webContents.send(event, data);
            }
          }
        });

        this.logger.info(`Render started with process ID: ${processId}`);

        // Emit event to update main UI
        this.emit('render-started-external', {
          processId,
          command: command,
          startedBy: 'External (Blender)',
          startTime: new Date().toISOString()
        });

        // Broadcast render started event to mobile clients
        this.broadcastToClients('render-started', {
          processId,
          command: command.substring(0, 100) + '...',
          startedBy: 'External (Blender)',
          startTime: new Date().toISOString()
        });

        // Send push notification if configured
        this.broadcastPushNotification({
          title: 'Render Started 🎬',
          body: 'A new render was started from Blender',
          data: {
            type: 'render_started',
            processId: String(processId),
            source: 'blender',
            startTime: new Date().toISOString()
          }
        });

        // Return success with process ID
        res.json({
          success: true,
          processId: processId,
          message: 'Render started successfully'
        });

      } catch (error) {
        this.logger.error('Execute render API error:', error);
        res.status(500).json({
          error: 'Failed to execute render',
          details: error.message
        });
      }
    });

    // Stop render (for Blender addon integration)
    this.app.post('/api/render/stop', async (req, res) => {
      try {
        const { processId } = req.body;

        this.logger.info('Render stop request received from external source');

        if (processId) {
          // Stop specific process
          await this.renderManager.stopProcess(processId);
          this.logger.info(`Stopped process: ${processId}`);

          this.broadcastToClients('render-stopped', {
            processId: processId,
            stoppedBy: 'External (Blender)',
            stopTime: new Date().toISOString()
          });

          res.json({
            success: true,
            message: `Process ${processId} stopped successfully`
          });
        } else {
          // Stop all renders
          this.renderManager.stopAllRenders();
          this.logger.info('Stopped all render processes');

          this.broadcastToClients('render-stopped', {
            stoppedBy: 'External (Blender)',
            stopTime: new Date().toISOString()
          });

          res.json({
            success: true,
            message: 'All renders stopped successfully'
          });
        }

      } catch (error) {
        this.logger.error('Stop render API error:', error);
        res.status(500).json({
          error: 'Failed to stop render',
          details: error.message
        });
      }
    });

    // Get current render status (for real-time monitoring)
    this.app.get('/api/render/status', async (req, res) => {
      try {
        const isRendering = this.renderManager.hasActiveRenders();
        const activeProcesses = this.renderManager.getActiveProcesses();
        const outputs = await this.renderManager.getRenderOutputs?.() || [];

        // Get most recent render output for progress info
        const currentRender = outputs.find(o => o.status === 'running');

        res.json({
          isRendering: isRendering,
          activeProcesses: activeProcesses.length,
          processIds: activeProcesses,
          currentRender: currentRender || null,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Get render status API error:', error);
        res.status(500).json({
          error: 'Failed to get render status',
          details: error.message
        });
      }
    });
  }

  // Helper function to generate unique output file names
  generateUniqueOutputPath(outputPath, fileName) {
    const fs = require('fs');
    const path = require('path');

    // Parse the filename and extension
    const parsedPath = path.parse(fileName);
    const baseName = parsedPath.name;
    const extension = parsedPath.ext;

    // Build the full path
    let fullPath = path.join(outputPath, fileName);
    let counter = 1;

    // Keep checking until we find a filename that doesn't exist
    while (fs.existsSync(fullPath)) {
      const newFileName = `${baseName}_${counter.toString().padStart(3, '0')}${extension}`;
      fullPath = path.join(outputPath, newFileName);
      counter++;

      // Safety check to prevent infinite loop
      if (counter > 999) {
        // Fall back to timestamp-based naming
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const timestampFileName = `${baseName}_${timestamp}${extension}`;
        fullPath = path.join(outputPath, timestampFileName);
        break;
      }
    }

    return fullPath;
  }

  async generateBlenderCommand(parameters) {
    let command = `"${parameters.blender_path}" -b`;

    // Base Settings
    if (parameters.blend_file) {
      command += ` "${parameters.blend_file}"`;
    }

    // Render Settings
    if (parameters.render_enabled) {
      // Engine
      if (parameters.render_engine) {
        command += ` -E ${parameters.render_engine}`;
      }

      // Scene
      if (parameters.scene) {
        command += ` -S "${parameters.scene}"`;
      }
    }

    // Output Settings
    if (parameters.output_enabled) {
      // Output format
      if (parameters.output_format) {
        command += ` -F ${parameters.output_format.toUpperCase()}`;
      }

      // Output path and filename with duplicate prevention
      if (parameters.output_path && parameters.output_filename) {
        const uniqueOutputPath = this.generateUniqueOutputPath(
          parameters.output_path,
          parameters.output_filename
        );
        command += ` -o "${uniqueOutputPath}"`;
      }
    }

    // Resolution Settings
    // NOTE: Blender reads resolution from .blend file
    // There are no direct CLI parameters for resolution X/Y
    // -x and -y are for different purposes (file extension, border render)
    // Resolution must be set in the .blend file itself

    // Frame Settings
    if (parameters.frames_enabled) {
      if (parameters.render_animation) {
        command += ` -s ${parameters.frame_start || 1}`;
        command += ` -e ${parameters.frame_end || 1}`;
        if (parameters.frame_jump && parameters.frame_jump > 1) {
          command += ` -j ${parameters.frame_jump}`;
        }
        command += ` -a`;
      } else if (parameters.single_frame !== undefined && parameters.single_frame !== null) {
        command += ` -f ${parameters.single_frame}`;
      }
    }

    return command;
  }

  async findBlenderInstallations() {
    const fs = require('fs');
    const path = require('path');
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    const installations = [];

    if (process.platform === 'win32') {
      // Common Blender installation paths on Windows
      const commonPaths = [
        path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Blender Foundation'),
        path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Blender Foundation'),
        path.join(require('os').homedir(), 'AppData', 'Local', 'Programs', 'Blender Foundation'),
      ];

      for (const basePath of commonPaths) {
        try {
          if (fs.existsSync(basePath)) {
            const versions = fs.readdirSync(basePath, { withFileTypes: true })
              .filter(dirent => dirent.isDirectory())
              .map(dirent => dirent.name);

            for (const version of versions) {
              const blenderExe = path.join(basePath, version, 'blender.exe');
              if (fs.existsSync(blenderExe)) {
                installations.push({
                  path: blenderExe,
                  version: version,
                  name: `Blender ${version}`
                });
              }
            }
          }
        } catch (error) {
          // Skip paths we can't access
          continue;
        }
      }
    }

    // Try to detect current Blender in PATH
    try {
      const { stdout } = await execAsync('blender --version');
      const versionMatch = stdout.match(/Blender\s+([\d.]+)/);
      if (versionMatch) {
        installations.push({
          path: 'blender',
          version: versionMatch[1],
          name: `Blender ${versionMatch[1]} (System PATH)`
        });
      }
    } catch (error) {
      // Blender not in PATH
    }

    return installations;
  }

  setupSocketIO() {
    console.log("🚀 SETTING UP SOCKET.IO SERVER");
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });
    console.log("✅ SOCKET.IO SERVER CONFIGURED");

    // Authentication middleware
    this.io.use((socket, next) => {
      const { pairingCode, deviceId, deviceName } = socket.handshake.auth;

      console.log(`🔍 AUTH ATTEMPT - deviceId: ${deviceId}, pairingCode: ${pairingCode}, deviceName: ${deviceName}`);
      console.log(`🔍 CURRENT PAIRING CODE: ${this.currentPairingCode}, expiry: ${this.pairingCodeExpiry}`);
      console.log(`🔍 TIME NOW: ${Date.now()}, is valid: ${this.validatePairingCode(pairingCode)}`);

      // Check if device is already paired
      if (deviceId && this.pairedDevices.has(deviceId)) {
        socket.deviceId = deviceId;
        socket.deviceName = this.pairedDevices.get(deviceId).name;
        this.logger.info(`Authenticated paired device: ${socket.deviceName} (${deviceId})`);
        return next();
      }

      // Check pairing code for new devices
      if (pairingCode && this.validatePairingCode(pairingCode)) {
        const newDeviceId = crypto.randomUUID();
        socket.deviceId = newDeviceId;
        socket.deviceName = deviceName || 'Mobile Device';

        // Add to paired devices
        this.pairedDevices.set(newDeviceId, {
          name: socket.deviceName,
          connectedAt: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        });

        this.savePairedDevices();
        this.clearPairingCode();

        console.log(`✅ NEW DEVICE PAIRED: ${socket.deviceName} (${newDeviceId})`);
        this.emit('device-paired', { deviceId: newDeviceId, deviceName: socket.deviceName });

        return next();
      }

      console.log(`❌ AUTHENTICATION FAILED for socket ${socket.id}`);
      console.log(`❌ REASON: No valid deviceId (${deviceId}) or pairingCode (${pairingCode})`);
      next(new Error('Authentication failed'));
    });

    this.io.on('connection', (socket) => {
      console.log(`🔌 NEW SOCKET CONNECTION ATTEMPT: ${socket.id}`);
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    this.logger.info(`Device connected: ${socket.deviceName} (${socket.deviceId})`);

    // Store connected client
    this.connectedClients.set(socket.id, {
      deviceId: socket.deviceId,
      socket: socket
    });

    // Update last seen
    if (this.pairedDevices.has(socket.deviceId)) {
      const device = this.pairedDevices.get(socket.deviceId);
      device.lastSeen = new Date().toISOString();
      this.pairedDevices.set(socket.deviceId, device);
      this.savePairedDevices();
    }

    // Send authenticated event with device ID to client
    socket.emit('authenticated', {
      deviceId: socket.deviceId,
      deviceName: socket.deviceName
    });

    // Send current render status
    this.sendRenderStatus(socket);

    // Setup event handlers
    this.setupSocketHandlers(socket);

    socket.on('disconnect', () => {
      this.logger.info(`Device disconnected: ${socket.deviceName} (${socket.deviceId})`);
      this.connectedClients.delete(socket.id);
    });
  }

  setupSocketHandlers(socket) {
    // Render control handlers
    socket.on('start-render', async (data) => {
      try {
        this.logger.info(`Start render request from ${socket.deviceName}`);

        if (!this.validateRenderParams(data)) {
          socket.emit('error', { message: 'Invalid render parameters' });
          return;
        }

        // Check if already rendering
        if (this.renderManager.hasActiveRenders()) {
          socket.emit('error', { message: 'Render already in progress' });
          return;
        }

        const processId = await this.renderManager.startRender(data.command, {
          send: (event, data) => {
            this.broadcastToClients('render-progress', { event, data });

            // Send push notification for important events
            if (event === 'progress' && data.progress === 100) {
              // Render completed
              this.broadcastPushNotification({
                title: 'Render Complete! 🎉',
                body: 'Your Blender render has finished successfully.',
                data: {
                  type: 'render_complete',
                  processId: processId.toString(),
                  progress: String(data.progress) // Ensure it's a string
                }
              });
            } else if (event === 'error') {
              // Render error
              console.log('  - Error message:', data.message);
              console.log('  - Message type:', typeof data.message);
              this.broadcastPushNotification({
                title: 'Render Error ❌',
                body: String(data.message || 'An error occurred during rendering.'),
                data: {
                  type: 'render_error',
                  processId: processId.toString(),
                  errorMessage: String(data.message || 'Unknown error')
                }
              });
            }
          }
        });

        this.broadcastToClients('render-started', { processId });

        // Send push notification for render start
        console.log('  - Process ID:', processId, 'Type:', typeof processId);
        this.broadcastPushNotification({
          title: 'Render Started 🎬',
          body: 'Your Blender render has begun.',
          data: {
            type: 'render_started',
            processId: String(processId), // Ensure it's a string
            startTime: new Date().toISOString()
          }
        });

      } catch (error) {
        this.logger.error(`Error starting render: ${error.message}`);
        socket.emit('error', { message: error.message });
      }
    });


    socket.on('stop-render', async (data) => {
      try {
        this.logger.info(`Stop render request from ${socket.deviceName}`);

        if (data.processId) {
          await this.renderManager.stopProcess(data.processId);
        } else {
          this.renderManager.stopAllRenders();
        }

        const stopData = {
          processId: data.processId || null,
          stoppedBy: socket.deviceName || 'Unknown',
          stopTime: new Date().toISOString()
        };

        this.broadcastToClients('render-stopped', stopData);

        // Send push notification for render stop
        this.broadcastPushNotification({
          title: 'Render Stopped 🛑',
          body: 'Your Blender render has been stopped.',
          data: {
            type: 'render_stopped',
            stoppedBy: String(socket.deviceName || 'Unknown'),
            stopTime: new Date().toISOString()
          }
        });

      } catch (error) {
        this.logger.error(`Error stopping render: ${error.message}`);
        socket.emit('error', { message: error.message });
      }
    });

    // Status requests
    socket.on('request-status', () => {
      this.sendRenderStatus(socket);
    });

    socket.on('request-system-stats', () => {
      // This would be implemented to get system stats
      // For now, send basic info
      socket.emit('system-stats', {
        cpu: { usage: '0%' },
        memory: { used: '0 GB', total: '0 GB', percentage: '0%' },
        gpu: []
      });
    });

    // Preset management
    socket.on('get-presets', async () => {
      try {
        const presets = this.store.get('presets', []);
        socket.emit('presets-list', presets);
      } catch (error) {
        socket.emit('error', { message: 'Failed to get presets' });
      }
    });

    socket.on('save-preset', async (preset) => {
      try {
        const presets = this.store.get('presets', []);
        const index = presets.findIndex(p => p.id === preset.id);

        if (index >= 0) {
          presets[index] = preset;
        } else {
          presets.push(preset);
        }

        this.store.set('presets', presets);
        this.broadcastToClients('preset-saved', preset);

      } catch (error) {
        socket.emit('error', { message: 'Failed to save preset' });
      }
    });

    // History requests
    socket.on('get-history', async () => {
      try {
        const history = this.store.get('renderHistory', []);
        socket.emit('render-history', history);
      } catch (error) {
        socket.emit('error', { message: 'Failed to get render history' });
      }
    });

    // Push notification token registration
    socket.on('register-push-token', async (data) => {
      try {
        this.logger.info(`Push token registration from ${socket.deviceName}`);

        if (!data.token) {
          socket.emit('error', { message: 'Invalid push token' });
          return;
        }

        // Store the token for this device
        this.deviceTokens.set(socket.deviceId, data.token);
        this.saveDeviceTokens();

        this.logger.info(`Push token registered for device ${socket.deviceName}: ${data.token.substring(0, 20)}...`);

        // Confirm registration
        socket.emit('push-token-registered', {
          success: true,
          deviceId: socket.deviceId
        });

      } catch (error) {
        this.logger.error(`Error registering push token: ${error.message}`);
        socket.emit('error', { message: 'Failed to register push token' });
      }
    });

    // Test push notification handler
    socket.on('test-push-notification', async (data) => {
      try {
        this.logger.info(`Test push notification request from ${socket.deviceName}`);

        // Test API connectivity before sending notification
        const apiAvailable = await this.testApiConnectivity();
        if (!apiAvailable) {
          console.log('❌ API not available for test');
          socket.emit('error', { message: 'Push notification API not available' });
          return;
        }

        // Prepare test data for API
        const dataPayload = {
          type: 'test',
          timestamp: Date.now().toString(),
          ...data.data
        };

        // Ensure all values are strings
        const stringifiedData = {};
        for (const [key, value] of Object.entries(dataPayload)) {
          stringifiedData[key] = String(value);
        }

        const testNotification = {
          title: data.title || 'Test Push Notification 🧪',
          body: data.body || 'This is a test push notification from BRS Desktop',
          data: stringifiedData
        };

        // Send to the requesting device
        const success = await this.sendPushNotification(socket.deviceId, testNotification);

        if (success) {
          socket.emit('test-push-result', {
            success: true,
            message: 'Test push notification sent successfully'
          });
        } else {
          socket.emit('test-push-result', {
            success: false,
            message: 'Failed to send test push notification - check desktop console for API errors',
            error: 'Push notification delivery failed'
          });
        }

      } catch (error) {
        this.logger.error(`Error sending test push notification: ${error.message}`);
        socket.emit('error', { message: 'Failed to send test push notification' });
      }
    });
  }

  validateRenderParams(data) {
    return data &&
           typeof data.command === 'string' &&
           data.command.trim().length > 0;
  }

  sendRenderStatus(socket) {
    const status = {
      isRendering: this.renderManager.hasActiveRenders(),
      activeProcesses: this.renderManager.processes.size,
      timestamp: new Date().toISOString()
    };

    socket.emit('render-status', status);
  }

  broadcastToClients(event, data) {
    for (const client of this.connectedClients.values()) {
      client.socket.emit(event, data);
    }
  }

  // Pairing code management
  generatePairingCode() {
    // Generate a 6-digit numeric code
    this.currentPairingCode = Math.floor(100000 + Math.random() * 900000).toString();
    this.pairingCodeExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes

    this.logger.info(`Generated pairing code: ${this.currentPairingCode}`);
    this.emit('pairing-code-generated', this.currentPairingCode);

    return this.currentPairingCode;
  }

  validatePairingCode(code) {
    return this.currentPairingCode === code && Date.now() <= this.pairingCodeExpiry;
  }

  clearPairingCode() {
    this.currentPairingCode = null;
    this.pairingCodeExpiry = null;
    this.emit('pairing-code-cleared');
  }

  getPairingCode() {
    if (!this.currentPairingCode || Date.now() > this.pairingCodeExpiry) {
      return null;
    }
    return this.currentPairingCode;
  }

  // Device management
  loadPairedDevices() {
    try {
      const devices = this.store.get('pairedDevices', {});
      this.pairedDevices = new Map(Object.entries(devices));
      this.logger.info(`Loaded ${this.pairedDevices.size} paired devices`);
    } catch (error) {
      this.logger.error(`Error loading paired devices: ${error.message}`);
    }
  }

  savePairedDevices() {
    try {
      const devices = Object.fromEntries(this.pairedDevices);
      this.store.set('pairedDevices', devices);
    } catch (error) {
      this.logger.error(`Error saving paired devices: ${error.message}`);
    }
  }

  removePairedDevice(deviceId) {
    if (this.pairedDevices.has(deviceId)) {
      const deviceName = this.pairedDevices.get(deviceId).name;
      this.pairedDevices.delete(deviceId);
      this.savePairedDevices();

      // Disconnect any active connections for this device
      for (const [socketId, client] of this.connectedClients.entries()) {
        if (client.deviceId === deviceId) {
          client.socket.disconnect(true);
          this.connectedClients.delete(socketId);
        }
      }

      this.logger.info(`Removed paired device: ${deviceName} (${deviceId})`);
      this.emit('device-removed', { deviceId, deviceName });
      return true;
    }
    return false;
  }

  getPairedDevices() {
    return Array.from(this.pairedDevices.entries()).map(([id, device]) => ({
      id,
      ...device,
      isConnected: Array.from(this.connectedClients.values()).some(client => client.deviceId === id)
    }));
  }

  getConnectedDevices() {
    return Array.from(this.connectedClients.values()).map(client => ({
      deviceId: client.deviceId,
      deviceName: this.pairedDevices.get(client.deviceId)?.name || 'Unknown Device'
    }));
  }

  // Server lifecycle
  async start() {
    if (this.isRunning) {
      this.logger.warn('Server is already running');
      return;
    }

    try {
      this.setupSocketIO();

      await new Promise((resolve, reject) => {
        this.httpServer.listen(this.port, '0.0.0.0', (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      console.log(`🎉 MOBILE COMPANION SERVER STARTED ON PORT ${this.port}`);
      console.log(`🌐 LISTENING ON: 0.0.0.0:${this.port}`);
      this.logger.info(`Mobile Companion Server started on port ${this.port}`);
      this.emit('server-started', { port: this.port });

    } catch (error) {
      this.logger.error(`Failed to start server: ${error.message}`);
      throw error;
    }
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      // Disconnect all clients
      if (this.io) {
        this.io.disconnectSockets(true);
      }

      // Close HTTP server
      if (this.httpServer) {
        await new Promise((resolve) => {
          this.httpServer.close(resolve);
        });
      }

      this.isRunning = false;
      this.connectedClients.clear();
      this.clearPairingCode();

      this.logger.info('Mobile Companion Server stopped');
      this.emit('server-stopped');

    } catch (error) {
      this.logger.error(`Error stopping server: ${error.message}`);
      throw error;
    }
  }

  getNetworkIP() {
    this.logger.info('Attempting to find network IP...');
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    const results = Object.create(null);

    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) {
          if (!results[name]) {
            results[name] = [];
          }
          results[name].push(net.address);
        }
      }
    }

    this.logger.info('Available network interfaces: ' + JSON.stringify(results, null, 2));

    const priorityInterfaces = ['Ethernet', 'Wi-Fi', 'en0', 'wlan0'];
    for (const iface of priorityInterfaces) {
      if (results[iface]) {
        this.logger.info(`Found priority interface '${iface}'. IP: ${results[iface][0]}`);
        return results[iface][0];
      }
    }

    this.logger.warn('No priority interface found. Falling back to the first available one.');

    const firstInterface = Object.keys(results)[0];
    if (firstInterface) {
      this.logger.info(`Using fallback interface '${firstInterface}'. IP: ${results[firstInterface][0]}`);
      return results[firstInterface][0];
    }

    this.logger.error('No suitable network interface found. Defaulting to 127.0.0.1.');
    return '127.0.0.1';
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connectedDevices: this.getConnectedDevices().length,
      pairedDevices: this.pairedDevices.size,
      currentPairingCode: this.getPairingCode(),
      networkIP: this.getNetworkIP()
    };
  }
}

module.exports = MobileCompanionServer;
