const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

class RenderManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.processes = new Map();
    this.manuallyStopped = new Set(); // Track manually stopped processes
    this.renderOutputs = new Map(); // Track render outputs with file paths

    // Skip IPC setup in test environment if explicitly disabled
    if (options.skipIpcSetup !== true) {
      this.setupIpcHandlers();
    }
  }

  setupIpcHandlers() {
    if (!ipcMain) return; // Guard for test environment

    ipcMain.handle('executeCommand', async (event, command) => {
      const processId = await this.startRender(command, event.sender);
      return { id: processId };
    });

    ipcMain.handle('stopProcess', async (_, processId) => {
      return this.stopProcess(processId);
    });

    ipcMain.handle('getRenderOutputs', async () => {
      return Array.from(this.renderOutputs.values());
    });
  }

  getUniqueFilePath(filePath) {
    const outputDir = path.dirname(filePath);
    const originalName = path.basename(filePath, path.extname(filePath));
    const extension = path.extname(filePath);

    let counter = 1;
    let newFilePath = filePath;

    while (fs.existsSync(newFilePath)) {
      const newName = `${originalName}_${counter}${extension}`;
      newFilePath = path.join(outputDir, newName);
      counter++;
    }

    return newFilePath;
  }

  isCriticalError(error) {
    const criticalErrors = [
      'No camera found in scene',
      'Process exited unexpectedly',
      'Failed to start Blender',
      'Invalid command',
      'Segmentation fault',
      'Access violation',
      'Fatal error',
      'Exception',
      'terminated unexpectedly',
      'possible crash'
    ];
    return criticalErrors.some(criticalError => error.toLowerCase().includes(criticalError.toLowerCase()));
  }

  getFrameRange(command) {
    const frameStartMatch = command.match(/-s\s+(\d+)/);
    const frameEndMatch = command.match(/-e\s+(\d+)/);
    const singleFrameMatch = command.match(/-f\s+(\d+)/);

    // Se c'è un singolo frame specificato con -f
    if (singleFrameMatch) {
      const frameNum = parseInt(singleFrameMatch[1]);
      return { start: frameNum, end: frameNum };
    }

    // Se non ci sono parametri -s e -e, default a frame 1
    if (!frameStartMatch || !frameEndMatch) {
      return { start: 1, end: 1 };
    }

    return {
      start: parseInt(frameStartMatch[1]),
      end: parseInt(frameEndMatch[1])
    };
  }

  extractOutputInfo(command) {
    // Extract output path
    const outputPathRegex = /-o\s+((?:"[^"]*")|(?:[^\s]+))/;
    const outputPathMatch = command.match(outputPathRegex);

    if (!outputPathMatch) {
      return null;
    }

    const baseOutputPath = outputPathMatch[1].replace(/"/g, '');
    const outputDir = path.dirname(baseOutputPath);

    // Extract format
    const formatMatch = command.match(/-F\s+([^\s]+)/);
    let extension = '.png';
    let isVideo = false;

    if (formatMatch && formatMatch[1]) {
      const format = formatMatch[1].toUpperCase();
      switch (format) {
        case 'JPEG':
          extension = '.jpg';
          break;
        case 'OPEN_EXR':
          extension = '.exr';
          break;
        case 'TIFF':
          extension = '.tif';
          break;
        case 'AVI_JPEG':
        case 'AVI_RAW':
        case 'FFMPEG':
          isVideo = true;
          extension = '.avi';
          break;
        default:
          extension = `.${format.toLowerCase()}`;
      }
    }

    // Check if it's an animation
    const isAnimation = command.includes(' -a');

    return {
      baseOutputPath,
      outputDir,
      extension,
      isVideo,
      isAnimation
    };
  }

  calculateOutputFilePath(command, frameNumber) {
    const outputInfo = this.extractOutputInfo(command);
    if (!outputInfo) return null;

    const { baseOutputPath, extension, isVideo, isAnimation } = outputInfo;

    if (isVideo) {
      // Video files don't have frame numbers
      return `${baseOutputPath}${extension}`;
    }

    if (isAnimation || frameNumber) {
      // For animations or specific frames, add padded frame number
      const paddedFrame = (frameNumber || 1).toString().padStart(4, '0');
      return `${baseOutputPath}${paddedFrame}${extension}`;
    }

    // Single frame without number
    return `${baseOutputPath}${extension}`;
  }

  async startRender(command, sender) {
    let processId = null;
    try {
      let finalCommand = command;

      // New, more robust logic to prevent overwriting files for both single frames and animations.
      const outputPathRegex = /-o\s+((?:"[^"]*")|(?:[^\s]+))/;
      const outputPathMatch = command.match(outputPathRegex);

      if (outputPathMatch) {
        let startFrame = -1;
        const singleFrameMatch = command.match(/-f\s+(\d+)/);
        const startFrameMatch = command.match(/-s\s+(\d+)/);

        if (singleFrameMatch) {
          // Single frame render
          startFrame = parseInt(singleFrameMatch[1], 10);
        } else if (startFrameMatch) {
          // Animation render
          startFrame = parseInt(startFrameMatch[1], 10);
        }

        if (startFrame !== -1) {
          const paddedFrame = startFrame.toString().padStart(4, '0');
          const originalOutputPart = outputPathMatch[0];
          const baseOutputPath = outputPathMatch[1].replace(/"/g, '');

          // Determine file extension, default to .png
          const formatMatch = command.match(/-F\s+([^\s]+)/);
          let extension = '.png';
          if (formatMatch && formatMatch[1]) {
            const format = formatMatch[1].toUpperCase();
            if (format === 'JPEG') extension = '.jpg';
            else if (format === 'OPEN_EXR') extension = '.exr';
            else if (format === 'TIFF') extension = '.tif';
            else extension = `.${format.toLowerCase()}`;
          }

          const predictedFinalPath = `${baseOutputPath}${paddedFrame}${extension}`;

          if (fs.existsSync(predictedFinalPath)) {
            let counter = 1;
            let newBaseOutputPath;
            let newFinalPath;

            do {
              const separator = baseOutputPath.endsWith('_') || baseOutputPath.endsWith(path.sep) ? '' : '_';
              newBaseOutputPath = `${baseOutputPath}${separator}${counter}`;
              newFinalPath = `${newBaseOutputPath}${paddedFrame}${extension}`;
              counter++;
            } while (fs.existsSync(newFinalPath));

            const newOutputPart = `-o "${newBaseOutputPath}"`;
            finalCommand = command.replace(originalOutputPart, newOutputPart);

            console.log(`[BRS] Predicted file existed: ${predictedFinalPath}. Changed render output to: ${newOutputPart}`);
          }
        }
      }

      const process = spawn(finalCommand, [], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      const processId = process.pid.toString();
      let currentFrame = 0;
      const { start, end } = this.getFrameRange(finalCommand);
      let memoryUsage = 0;
      let peakMemory = 0;
      let currentSample = 0;
      let totalSamples = 0;
      let inCompositing = false;
      let compositingOperation = '';

      // Extract output info for tracking
      const outputInfo = this.extractOutputInfo(finalCommand);
      const outputFile = this.calculateOutputFilePath(finalCommand, start);

      // Track render output
      const renderOutput = {
        id: processId,
        name: outputInfo ? path.basename(outputInfo.baseOutputPath) : `Render ${processId}`,
        status: 'running',
        outputPath: outputInfo ? outputInfo.outputDir : '',
        outputFile: outputFile,
        isVideo: outputInfo ? outputInfo.isVideo : false,
        isAnimation: outputInfo ? outputInfo.isAnimation : false,
        progress: 0,
        currentFrame: start,
        totalFrames: end,
        startTime: new Date().toISOString(),
        command: finalCommand
      };

      this.renderOutputs.set(processId, renderOutput);

      // Emit render-output-started event
      this.emit('render-output-started', renderOutput);

      // Invia il range di frame all'inizio
      if (sender && sender.send) {
        sender.send(`progress-${processId}`, {
          currentFrame: start,
          totalFrames: end,
          progress: 0
        });
      }

      process.stdout.on('data', (data) => {
        const output = data.toString();

        // Log dell'output
        if (sender && sender.send) {
          sender.send(`progress-${processId}`, output);
        }

        // Parsing dell'output per estrarre informazioni
        if (output.includes('Fra:')) {
          // Estrai il numero di frame
          const frameMatch = output.match(/Fra:(\d+)/);
          if (frameMatch) {
            currentFrame = parseInt(frameMatch[1]);

            // Calcola il progresso gestendo il caso di singolo frame
            let progress;
            if (start === end) {
              // Singolo frame: progresso basato sul completamento del frame
              progress = currentFrame >= start ? 100 : 0;
            } else {
              // Animazione: progresso normale
              progress = ((currentFrame - start) / (end - start)) * 100;
            }

            if (sender && sender.send) {
              sender.send(`progress-${processId}`, {
                currentFrame,
                totalFrames: end,
                progress
              });
            }

            // Update render output tracking
            const renderOutput = this.renderOutputs.get(processId);
            if (renderOutput) {
              renderOutput.progress = progress;
              renderOutput.currentFrame = currentFrame;

              // Update output file path for current frame
              const newOutputFile = this.calculateOutputFilePath(finalCommand, currentFrame);
              if (newOutputFile) {
                renderOutput.outputFile = newOutputFile;
              }

              this.renderOutputs.set(processId, renderOutput);

              // Emit render-output-progress event
              this.emit('render-output-progress', {
                processId,
                progress,
                currentFrame,
                totalFrames: end,
                outputFile: newOutputFile
              });
            }

            // Emit progress event for mobile companion
            this.emit('render-progress', {
              processId,
              event: 'progress',
              data: {
                currentFrame,
                totalFrames: end,
                percentage: progress
              }
            });
          }

          // Estrai l'uso della memoria
          const memMatch = output.match(/Mem:([\d.]+)([MG]).*Peak\s+([\d.]+)([MG])/);
          if (memMatch) {
            const current = parseFloat(memMatch[1]);
            const peak = parseFloat(memMatch[3]);
            const currentUnit = memMatch[2];
            const peakUnit = memMatch[4];

            // Converti in MB
            memoryUsage = currentUnit === 'G' ? current * 1024 : current;
            peakMemory = peakUnit === 'G' ? peak * 1024 : peak;

            if (sender && sender.send) {
              sender.send(`progress-${processId}`, {
                memoryUsage,
                peakMemory
              });
            }

            // Emit memory progress for mobile companion
            this.emit('render-progress', {
              processId,
              event: 'progress',
              data: {
                memoryUsed: memoryUsage,
                memoryTotal: peakMemory
              }
            });
          }

          // Parse sample progress for Cycles
          const sampleMatch = output.match(/Sample (\d+)\/(\d+)/);
          if (sampleMatch) {
            currentSample = parseInt(sampleMatch[1]);
            totalSamples = parseInt(sampleMatch[2]);
            if (sender && sender.send) {
              sender.send(`progress-${processId}`, {
                currentSample,
                totalSamples
              });
            }

            // Emit sample progress for mobile companion
            this.emit('render-progress', {
              processId,
              event: 'progress',
              data: {
                currentSample,
                totalSamples
              }
            });
          }

          // Check for compositing
          if (output.includes('Compositing')) {
            inCompositing = true;
            const compMatch = output.match(/Compositing \| (.*?)(?=\||$)/);
            if (compMatch) {
              compositingOperation = compMatch[1].trim();
            }
            if (sender && sender.send) {
              sender.send(`progress-${processId}`, {
                inCompositing,
                compositingOperation
              });
            }
          }
        }

        // Check for errors
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('exception')) {
          if (sender && sender.send) {
            sender.send(`error-${processId}`, output);
          }

          // Only remove process for critical errors, not all errors
          if (this.isCriticalError(output)) {
            this.processes.delete(processId);
            console.log(`Process ${processId} had critical stdout error and removed from active processes. Remaining: ${this.processes.size}`);

            // Update render output tracking
            const renderOutput = this.renderOutputs.get(processId);
            if (renderOutput) {
              renderOutput.status = 'failed';
              renderOutput.endTime = new Date().toISOString();
              this.renderOutputs.set(processId, renderOutput);

              // Emit render-output-failed event
              this.emit('render-output-failed', {
                processId,
                error: output
              });
            }
          }

          // Emit error event for mobile companion
          this.emit('render-error', {
            processId,
            error: output
          });
        }

        // Check for process termination
        if (output.includes('Blender quit') || output.includes('Quit')) {
          if (sender && sender.send) {
            sender.send(`complete-${processId}`, 0);
          }

          // Update render output tracking
          const renderOutput = this.renderOutputs.get(processId);
          if (renderOutput) {
            renderOutput.status = 'completed';
            renderOutput.progress = 100;
            renderOutput.endTime = new Date().toISOString();
            this.renderOutputs.set(processId, renderOutput);

            // Emit render-output-completed event
            this.emit('render-output-completed', {
              processId,
              outputFile: renderOutput.outputFile,
              isVideo: renderOutput.isVideo,
              outputPath: renderOutput.outputPath
            });
          }

          // Remove process from active processes map
          this.processes.delete(processId);
          console.log(`Process ${processId} completed and removed from active processes. Remaining: ${this.processes.size}`);

          // Emit completion event for mobile companion
          this.emit('render-completed', {
            processId,
            exitCode: 0
          });
        }
      });

      process.stderr.on('data', (data) => {
        const error = data.toString();
        if (this.isCriticalError(error)) {
          if (sender && sender.send) {
            sender.send(`error-${processId}`, error);
          }

          // Remove process from active processes map for critical errors
          this.processes.delete(processId);
          console.log(`Process ${processId} had critical stderr error and removed from active processes. Remaining: ${this.processes.size}`);

          // Emit error event for mobile companion
          this.emit('render-error', {
            processId,
            error: error
          });
        } else {
          if (sender && sender.send) {
            sender.send(`progress-${processId}`, `ERROR: ${error}`);
          }
        }
      });

      process.on('close', (code) => {
        if (sender && sender.send) {
          sender.send(`complete-${processId}`, code);
        }

        // Remove process from active processes map
        this.processes.delete(processId);
        console.log(`Process ${processId} removed from active processes. Remaining: ${this.processes.size}`);

        // Check if this process was manually stopped
        const wasManuallyStopped = this.manuallyStopped.has(processId);
        if (wasManuallyStopped) {
          console.log(`Process ${processId} was manually stopped, not emitting error for exit code ${code}`);
          this.manuallyStopped.delete(processId); // Clean up
          // render-stopped event was already emitted in stopProcess/stopAllRenders
          return;
        }

        // Update render output tracking
        const renderOutput = this.renderOutputs.get(processId);
        if (renderOutput && renderOutput.status === 'running') {
          if (code === 0) {
            renderOutput.status = 'completed';
            renderOutput.progress = 100;
            renderOutput.endTime = new Date().toISOString();
            this.renderOutputs.set(processId, renderOutput);

            // Emit render-output-completed event
            this.emit('render-output-completed', {
              processId,
              outputFile: renderOutput.outputFile,
              isVideo: renderOutput.isVideo,
              outputPath: renderOutput.outputPath
            });
          } else {
            renderOutput.status = 'failed';
            renderOutput.endTime = new Date().toISOString();
            this.renderOutputs.set(processId, renderOutput);

            // Emit render-output-failed event
            this.emit('render-output-failed', {
              processId,
              error: `Process exited with code ${code}`
            });
          }
        }

        // Emit completion/error event for mobile companion
        if (code === 0) {
          this.emit('render-completed', {
            processId,
            exitCode: code
          });
        } else {
          this.emit('render-error', {
            processId,
            error: `Process exited with code ${code}`
          });
        }
      });

      process.on('error', (error) => {
        const errorMessage = error.message;
        if (this.isCriticalError(errorMessage)) {
          if (sender && sender.send) {
            sender.send(`error-${processId}`, errorMessage);
          }

          // Remove process from active processes map for critical errors
          this.processes.delete(processId);
          console.log(`Process ${processId} had critical error and removed from active processes. Remaining: ${this.processes.size}`);

          // Emit error event for mobile companion
          this.emit('render-error', {
            processId,
            error: errorMessage
          });
        } else {
          if (sender && sender.send) {
            sender.send(`progress-${processId}`, `ERROR: ${errorMessage}`);
          }
        }
      });

      // Salva il processo nella Map usando il PID di sistema
      this.processes.set(processId, {
        process,
        command,
        startTime: new Date()
      });

      // Emit events for mobile companion
      this.emit('render-started', {
        processId,
        command,
        startTime: new Date()
      });

      return processId;
    } catch (error) {
      if (sender && sender.send) {
        sender.send(`error-${processId}`, error.message);
      }
      throw error;
    }
  }

  async stopProcess(processId) {
    const renderProcess = this.processes.get(processId);
    if (renderProcess) {
      // Mark this process as manually stopped to prevent error emission
      this.manuallyStopped.add(processId);
      console.log(`Process ${processId} marked as manually stopped`);

      if (renderProcess.process) {
        try {
          console.log(`Stopping individual process ${processId} (PID: ${renderProcess.process.pid})`);

          if (process.platform === 'win32') {
            // Windows: Use taskkill to terminate the entire process tree
            const { execSync } = require('child_process');
            try {
              execSync(`taskkill /pid ${renderProcess.process.pid} /T /F`, { stdio: 'ignore' });
              console.log(`Successfully terminated process tree for PID ${renderProcess.process.pid}`);
            } catch (error) {
              console.error(`Error using taskkill for PID ${renderProcess.process.pid}:`, error.message);
              // Fallback to standard kill
              renderProcess.process.kill('SIGTERM');
            }
          } else {
            // Unix-like systems
            renderProcess.process.kill('SIGTERM');

            // Give process time to terminate gracefully, then force kill if needed
            setTimeout(() => {
              if (!renderProcess.process.killed) {
                console.log(`Force killing process ${processId}`);
                try {
                  renderProcess.process.kill('SIGKILL');
                } catch (error) {
                  console.error(`Error force killing process ${processId}:`, error.message);
                }
              }
            }, 2000);
          }
        } catch (error) {
          console.error(`Error stopping process ${processId}:`, error.message);
        }
      }
      this.processes.delete(processId);

      // Emit stopped event for mobile companion
      this.emit('render-stopped', {
        processId
      });
    }
  }

  hasActiveRenders() {
    console.log(`Checking active renders: ${this.processes.size} processes active`);
    if (this.processes.size > 0) {
      console.log('Active process IDs:', Array.from(this.processes.keys()));
    }
    return this.processes.size > 0;
  }

  getActiveProcesses() {
    return Array.from(this.processes.keys());
  }

  stopAllRenders() {
    console.log(`Stopping ${this.processes.size} active render processes...`);

    // Mark all processes as manually stopped to prevent error emission
    for (const [processId] of this.processes) {
      this.manuallyStopped.add(processId);
      console.log(`Process ${processId} marked as manually stopped`);
    }

    for (const [processId, renderProcess] of this.processes) {
      if (renderProcess.process) {
        try {
          console.log(`Terminating process ${processId} (PID: ${renderProcess.process.pid})`);

          // Try graceful termination first
          if (process.platform === 'win32') {
            // Windows: Use taskkill to terminate the entire process tree
            const { execSync } = require('child_process');
            try {
              execSync(`taskkill /pid ${renderProcess.process.pid} /T /F`, { stdio: 'ignore' });
              console.log(`Successfully terminated process tree for PID ${renderProcess.process.pid}`);
            } catch (error) {
              console.error(`Error using taskkill for PID ${renderProcess.process.pid}:`, error.message);
              // Fallback to standard kill
              renderProcess.process.kill('SIGTERM');
            }
          } else {
            // Unix-like systems: Try SIGTERM first, then SIGKILL
            renderProcess.process.kill('SIGTERM');

            // Give process time to terminate gracefully
            setTimeout(() => {
              if (!renderProcess.process.killed) {
                console.log(`Force killing process ${processId}`);
                renderProcess.process.kill('SIGKILL');
              }
            }, 2000);
          }
        } catch (error) {
          console.error(`Error terminating process ${processId}:`, error.message);
        }
      }
    }

    this.processes.clear();
    console.log('All render processes cleanup completed');
  }

  async getBlenderVersion(blenderPath) {
    try {
      return new Promise((resolve, reject) => {
        const process = spawn(blenderPath, ['--version'], {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';

        process.stdout.on('data', (data) => {
          output += data.toString();
        });

        process.on('close', (code) => {
          if (code === 0) {
            const versionMatch = output.match(/Blender\s+([\d.]+)/);
            resolve(versionMatch ? versionMatch[1] : 'Unknown');
          } else {
            reject(new Error('Failed to get Blender version'));
          }
        });

        process.on('error', (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error('Error getting Blender version:', error);
      return 'Unknown';
    }
  }
}

module.exports = RenderManager;
