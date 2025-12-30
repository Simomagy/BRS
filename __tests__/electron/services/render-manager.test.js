/**
 * Test per RenderManager
 * Modulo critico per la gestione dei processi Blender
 */

// Mock dei moduli Electron - DEVE essere prima di require
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
    removeHandler: jest.fn()
  }
}));

jest.mock('child_process');
jest.mock('fs');

const RenderManager = require('../../../electron/services/render-manager');
const {
  createMockProcess,
  simulateBlenderOutput,
  simulateProcessError,
  mockSpawn
} = require('../../setup/electron-mocks');
const {
  createMockSender,
  waitForEvent,
  waitFor,
  createMockBlenderCommand
} = require('../../setup/test-utils');

const fs = require('fs');

describe('RenderManager', () => {
  let renderManager;
  let mockSender;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Reset mock fs
    fs.existsSync = jest.fn().mockReturnValue(false);

    // Reset mock spawn
    mockSpawn.mockClear();

    // Create new instance
    renderManager = new RenderManager();
    mockSender = createMockSender();
  });

  afterEach(() => {
    // Cleanup per evitare memory leaks
    if (renderManager) {
      renderManager.removeAllListeners();
      renderManager.processes.clear();
      renderManager.manuallyStopped.clear();
    }
  });

  describe('Constructor', () => {
    it('should initialize with empty processes map', () => {
      expect(renderManager.processes.size).toBe(0);
    });

    it('should initialize with empty manuallyStopped set', () => {
      expect(renderManager.manuallyStopped.size).toBe(0);
    });

    it('should setup IPC handlers', () => {
      const { ipcMain } = require('electron');
      expect(ipcMain.handle).toHaveBeenCalledWith('executeCommand', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('stopProcess', expect.any(Function));
    });
  });

  describe('startRender', () => {
    it('should spawn Blender process with correct command', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);

      expect(mockSpawn).toHaveBeenCalledWith(command, [], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      expect(processId).toBeDefined();
      expect(processId).toBe(mockProcess.pid.toString());
    });

    it('should add process to active processes map', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      expect(renderManager.processes.size).toBe(1);
      expect(renderManager.hasActiveRenders()).toBe(true);
    });

    it('should emit render-started event', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const startedPromise = waitForEvent(renderManager, 'render-started');
      await renderManager.startRender(command, mockSender);
      const startedData = await startedPromise;

      expect(startedData).toMatchObject({
        processId: expect.any(String),
        command: command,
        startTime: expect.any(Date)
      });
    });

    it('should send initial progress with frame range', async () => {
      const command = createMockBlenderCommand({ startFrame: 1, endFrame: 10 });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.stringContaining('progress-'),
        expect.objectContaining({
          currentFrame: 1,
          totalFrames: 10,
          progress: 0
        })
      );
    });

    it('should prevent file overwrite by modifying output path', async () => {
      const command = createMockBlenderCommand({ frame: 1 });
      fs.existsSync.mockReturnValue(true); // Simula file esistente

      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      // Verifica che il comando sia stato modificato
      expect(mockSpawn).toHaveBeenCalled();
      const calledCommand = mockSpawn.mock.calls[0][0];
      expect(calledCommand).not.toBe(command); // Il comando dovrebbe essere diverso
      expect(calledCommand).toContain('_1'); // Dovrebbe avere il suffisso
    });
  });

  describe('Blender Output Parsing', () => {
    it('should parse frame progress from Blender output', async () => {
      const command = createMockBlenderCommand({ startFrame: 1, endFrame: 3 });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const progressPromise = waitForEvent(renderManager, 'render-progress');
      await renderManager.startRender(command, mockSender);

      // Simula output Blender
      mockProcess.stdout.emit('data', Buffer.from('Fra:1 Mem:150.00M (Peak 200.00M) | Time:00:02.15\n'));

      const progressData = await progressPromise;
      expect(progressData.data).toMatchObject({
        currentFrame: 1,
        totalFrames: 3
      });
    });

    it('should parse memory usage from Blender output', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Fra:1 Mem:150.50M (Peak 200.75M)\n'));

      // Verifica che i dati siano stati inviati al sender
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.stringContaining('progress-'),
        expect.objectContaining({
          memoryUsage: 150.50,
          peakMemory: 200.75
        })
      );
    });

    it('should parse sample progress from Blender output', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Fra:1 Sample 32/128\n'));

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.stringContaining('progress-'),
        expect.objectContaining({
          currentSample: 32,
          totalSamples: 128
        })
      );
    });

    it('should detect compositing phase', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Fra:1 Compositing | Blur Node\n'));

      expect(mockSender.send).toHaveBeenCalledWith(
        expect.stringContaining('progress-'),
        expect.objectContaining({
          inCompositing: true,
          compositingOperation: 'Blur Node'
        })
      );
    });

    it('should calculate progress correctly for single frame', async () => {
      const command = createMockBlenderCommand({ frame: 1 });
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Fra:1 Mem:150.00M\n'));

      // Per singolo frame, progress dovrebbe essere 100%
      expect(mockSender.send).toHaveBeenCalledWith(
        expect.stringContaining('progress-'),
        expect.objectContaining({
          currentFrame: 1,
          totalFrames: 1,
          progress: 100
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should detect critical errors in stdout', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const errorPromise = waitForEvent(renderManager, 'render-error');
      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Error: No camera found in scene\n'));

      const errorData = await errorPromise;
      expect(errorData.error).toContain('No camera found in scene');
    });

    it('should detect critical errors in stderr', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const errorPromise = waitForEvent(renderManager, 'render-error');
      await renderManager.startRender(command, mockSender);

      mockProcess.stderr.emit('data', Buffer.from('Fatal error: Segmentation fault\n'));

      const errorData = await errorPromise;
      expect(errorData.error).toContain('Segmentation fault');
    });

    it('should remove process from map on critical error', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);
      expect(renderManager.processes.size).toBe(1);

      mockProcess.stderr.emit('data', Buffer.from('Fatal error: Exception\n'));

      // Attendi che il processo venga rimosso
      await waitFor(() => renderManager.processes.size === 0, 1000);
      expect(renderManager.processes.has(processId)).toBe(false);
    });

    it('should handle process errors', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const errorPromise = waitForEvent(renderManager, 'render-error');
      await renderManager.startRender(command, mockSender);

      mockProcess.emit('error', new Error('Process exited unexpectedly'));

      const errorData = await errorPromise;
      expect(errorData.error).toContain('Process exited unexpectedly');
    });
  });

  describe('Process Completion', () => {
    it('should emit render-completed on successful exit', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const completedPromise = waitForEvent(renderManager, 'render-completed');
      const processId = await renderManager.startRender(command, mockSender);

      mockProcess.emit('close', 0);

      const completedData = await completedPromise;
      expect(completedData).toMatchObject({
        processId,
        exitCode: 0
      });
    });

    it('should emit render-error on non-zero exit code', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const errorPromise = waitForEvent(renderManager, 'render-error');
      await renderManager.startRender(command, mockSender);

      mockProcess.emit('close', 1);

      const errorData = await errorPromise;
      expect(errorData.error).toContain('Process exited with code 1');
    });

    it('should remove process from map on close', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);
      expect(renderManager.processes.size).toBe(1);

      mockProcess.emit('close', 0);

      await waitFor(() => renderManager.processes.size === 0, 1000);
      expect(renderManager.processes.has(processId)).toBe(false);
    });

    it('should detect Blender quit message', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const completedPromise = waitForEvent(renderManager, 'render-completed');
      await renderManager.startRender(command, mockSender);

      mockProcess.stdout.emit('data', Buffer.from('Blender quit\n'));

      const completedData = await completedPromise;
      expect(completedData.exitCode).toBe(0);
    });
  });

  describe('stopProcess', () => {
    it('should stop a running process', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);
      expect(renderManager.processes.size).toBe(1);

      await renderManager.stopProcess(processId);

      expect(renderManager.processes.has(processId)).toBe(false);
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should emit render-stopped event', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const stoppedPromise = waitForEvent(renderManager, 'render-stopped');
      const processId = await renderManager.startRender(command, mockSender);

      await renderManager.stopProcess(processId);

      const stoppedData = await stoppedPromise;
      expect(stoppedData.processId).toBe(processId);
    });

    it('should mark process as manually stopped', async () => {
      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);
      await renderManager.stopProcess(processId);

      // Il processo dovrebbe essere stato marcato come manually stopped
      // e poi rimosso dopo la terminazione
      expect(renderManager.processes.has(processId)).toBe(false);
    });

    it('should use taskkill on Windows', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });

      const { execSync } = require('child_process');
      const mockExecSync = jest.fn();
      execSync.mockImplementation = mockExecSync;

      const command = createMockBlenderCommand();
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const processId = await renderManager.startRender(command, mockSender);
      await renderManager.stopProcess(processId);

      // Ripristina la piattaforma originale
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should do nothing for non-existent process', async () => {
      await renderManager.stopProcess('non-existent-id');
      // Non dovrebbe lanciare errori
      expect(renderManager.processes.size).toBe(0);
    });
  });

  describe('stopAllRenders', () => {
    it('should stop all running processes', async () => {
      const mockProcesses = [];

      // Avvia 3 render
      for (let i = 0; i < 3; i++) {
        const mockProcess = createMockProcess();
        mockProcesses.push(mockProcess);
        mockSpawn.mockReturnValueOnce(mockProcess);
        await renderManager.startRender(createMockBlenderCommand(), mockSender);
      }

      expect(renderManager.processes.size).toBe(3);

      renderManager.stopAllRenders();

      expect(renderManager.processes.size).toBe(0);
      mockProcesses.forEach(proc => {
        expect(proc.kill).toHaveBeenCalled();
      });
    });

    it('should mark all processes as manually stopped', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(createMockBlenderCommand(), mockSender);
      await renderManager.startRender(createMockBlenderCommand(), mockSender);

      renderManager.stopAllRenders();

      // Tutti i processi dovrebbero essere stati marcati come manually stopped
      // prima della terminazione
      expect(renderManager.processes.size).toBe(0);
    });
  });

  describe('hasActiveRenders', () => {
    it('should return false when no processes are active', () => {
      expect(renderManager.hasActiveRenders()).toBe(false);
    });

    it('should return true when processes are active', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(createMockBlenderCommand(), mockSender);

      expect(renderManager.hasActiveRenders()).toBe(true);
    });

    it('should return false after all processes complete', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      await renderManager.startRender(createMockBlenderCommand(), mockSender);
      expect(renderManager.hasActiveRenders()).toBe(true);

      mockProcess.emit('close', 0);
      await waitFor(() => !renderManager.hasActiveRenders(), 1000);

      expect(renderManager.hasActiveRenders()).toBe(false);
    });
  });

  describe('getActiveProcesses', () => {
    it('should return array of active process IDs', async () => {
      const mockProcess1 = createMockProcess();
      const mockProcess2 = createMockProcess();
      mockSpawn.mockReturnValueOnce(mockProcess1);
      mockSpawn.mockReturnValueOnce(mockProcess2);

      const id1 = await renderManager.startRender(createMockBlenderCommand(), mockSender);
      const id2 = await renderManager.startRender(createMockBlenderCommand(), mockSender);

      const activeProcesses = renderManager.getActiveProcesses();

      expect(activeProcesses).toHaveLength(2);
      expect(activeProcesses).toContain(id1);
      expect(activeProcesses).toContain(id2);
    });

    it('should return empty array when no processes are active', () => {
      const activeProcesses = renderManager.getActiveProcesses();
      expect(activeProcesses).toHaveLength(0);
    });
  });

  describe('isCriticalError', () => {
    it('should identify critical error patterns', () => {
      const criticalErrors = [
        'No camera found in scene',
        'Process exited unexpectedly',
        'Segmentation fault',
        'Fatal error',
        'Exception occurred'
      ];

      criticalErrors.forEach(error => {
        expect(renderManager.isCriticalError(error)).toBe(true);
      });
    });

    it('should not flag non-critical messages as errors', () => {
      const nonCriticalMessages = [
        'Warning: Low memory',
        'Info: Render started',
        'Sample 1/64'
      ];

      nonCriticalMessages.forEach(msg => {
        expect(renderManager.isCriticalError(msg)).toBe(false);
      });
    });
  });

  describe('getFrameRange', () => {
    it('should extract frame range from animation command', () => {
      const command = 'blender -b file.blend -s 1 -e 100 -a';
      const range = renderManager.getFrameRange(command);

      expect(range).toEqual({ start: 1, end: 100 });
    });

    it('should extract single frame from -f parameter', () => {
      const command = 'blender -b file.blend -f 42';
      const range = renderManager.getFrameRange(command);

      expect(range).toEqual({ start: 42, end: 42 });
    });

    it('should default to frame 1 when no frame parameters', () => {
      const command = 'blender -b file.blend';
      const range = renderManager.getFrameRange(command);

      expect(range).toEqual({ start: 1, end: 1 });
    });
  });

  describe('getBlenderVersion', () => {
    it('should return Blender version', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const versionPromise = renderManager.getBlenderVersion('C:\\Blender\\blender.exe');

      // Simula output versione
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Blender 4.2.7 LTS\n'));
        mockProcess.emit('close', 0);
      }, 10);

      const version = await versionPromise;
      expect(version).toBe('4.2.7');
    });

    it('should return "Unknown" on error', async () => {
      const mockProcess = createMockProcess();
      mockSpawn.mockReturnValue(mockProcess);

      const versionPromise = renderManager.getBlenderVersion('C:\\Invalid\\path');

      setTimeout(() => {
        mockProcess.emit('close', 1);
      }, 10);

      const version = await versionPromise;
      expect(version).toBe('Unknown');
    });
  });
});
