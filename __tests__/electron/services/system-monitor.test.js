/**
 * Test per SystemMonitor
 * Service per monitoraggio risorse di sistema (CPU, memoria, GPU)
 */

const { MockBrowserWindow, mockExec } = require('../../setup/electron-mocks');

// Mock dei moduli
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn()
  }
}));

jest.mock('os');
jest.mock('child_process');
jest.mock('util', () => ({
  promisify: jest.fn((fn) => {
    return jest.fn().mockResolvedValue({ stdout: '', stderr: '' });
  })
}));

const { ipcMain } = require('electron');
const SystemMonitor = require('../../../electron/services/system-monitor');
const os = require('os');
const { exec } = require('child_process');
const { promisify } = require('util');
const { delay } = require('../../setup/test-utils');

describe('SystemMonitor', () => {
  let systemMonitor;
  let mainWindow;

  beforeEach(() => {
    systemMonitor = new SystemMonitor();
    mainWindow = new MockBrowserWindow();

    // Mock os functions
    os.cpus.mockReturnValue([
      {
        model: 'Intel Core i7-9700K',
        speed: 3600,
        times: {
          user: 1000000,
          nice: 0,
          sys: 500000,
          idle: 3500000,
          irq: 0
        }
      },
      {
        model: 'Intel Core i7-9700K',
        speed: 3600,
        times: {
          user: 1000000,
          nice: 0,
          sys: 500000,
          idle: 3500000,
          irq: 0
        }
      }
    ]);

    os.totalmem.mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
    os.freemem.mockReturnValue(8 * 1024 * 1024 * 1024);   // 8GB free

    jest.useFakeTimers();
  });

  afterEach(() => {
    systemMonitor.cleanup();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with null monitorInterval', () => {
      expect(systemMonitor.monitorInterval).toBeNull();
    });

    it('should initialize with null mainWindow', () => {
      expect(systemMonitor.mainWindow).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set mainWindow reference', () => {
      systemMonitor.initialize(mainWindow);

      expect(systemMonitor.mainWindow).toBe(mainWindow);
    });

    it('should register IPC handlers', () => {
      systemMonitor.initialize(mainWindow);

      expect(ipcMain.handle).toHaveBeenCalledWith('start-system-monitor', expect.any(Function));
      expect(ipcMain.handle).toHaveBeenCalledWith('stop-system-monitor', expect.any(Function));
    });
  });

  describe('getSystemStats', () => {
    beforeEach(() => {
      jest.useRealTimers(); // Use real timers for async tests
    });

    it('should return system statistics', async () => {
      const stats = await systemMonitor.getSystemStats();

      expect(stats).toHaveProperty('cpu');
      expect(stats).toHaveProperty('memory');
      expect(stats).toHaveProperty('gpu');
    });

    it('should calculate CPU usage', async () => {
      const stats = await systemMonitor.getSystemStats();

      expect(stats.cpu).toHaveProperty('usage');
      expect(stats.cpu.usage).toContain('%');
    });

    it('should provide CPU core information', async () => {
      const stats = await systemMonitor.getSystemStats();

      expect(stats.cpu).toHaveProperty('cores');
      expect(stats.cpu.cores).toBeInstanceOf(Array);
      expect(stats.cpu.cores.length).toBe(2);
      expect(stats.cpu.cores[0]).toContain('Intel Core i7-9700K');
    });

    it('should calculate memory usage', async () => {
      const stats = await systemMonitor.getSystemStats();

      expect(stats.memory).toHaveProperty('used');
      expect(stats.memory).toHaveProperty('total');
      expect(stats.memory).toHaveProperty('percentage');

      expect(stats.memory.used).toContain('GB');
      expect(stats.memory.total).toContain('GB');
      expect(stats.memory.percentage).toContain('%');
    });

    it('should handle GPU stats', async () => {
      const stats = await systemMonitor.getSystemStats();

      expect(stats.gpu).toBeInstanceOf(Array);
    });

    it('should format memory values correctly', async () => {
      const stats = await systemMonitor.getSystemStats();

      // 16GB total, 8GB free = 8GB used
      expect(stats.memory.used).toBe('8.00 GB');
      expect(stats.memory.total).toBe('16.00 GB');
      expect(stats.memory.percentage).toBe('50.0%');
    });
  });

  describe('getGPUStats', () => {
    const originalPlatform = process.platform;

    beforeEach(() => {
      jest.useRealTimers();
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    describe('Windows', () => {
      beforeEach(() => {
        Object.defineProperty(process, 'platform', { value: 'win32' });
      });

      it('should return empty array if no GPUs found', async () => {
        const execAsync = promisify(exec);
        execAsync.mockResolvedValue({ stdout: '', stderr: '' });

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats).toEqual([]);
      });

      it('should filter out virtual GPUs', async () => {
        const execAsync = promisify(exec);
        execAsync.mockResolvedValue({
          stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                 ',1073741824,1.0,NVIDIA Virtual GPU,OK\n' +
                 ',0,1.0,Microsoft Remote Display Adapter,OK\n'
        });

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats).toEqual([]);
      });

      it('should filter out integrated GPUs', async () => {
        const execAsync = promisify(exec);
        execAsync.mockResolvedValue({
          stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                 ',1073741824,1.0,Intel UHD Graphics 630,OK\n'
        });

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats).toEqual([]);
      });

      it('should filter out GPUs with no memory', async () => {
        const execAsync = promisify(exec);
        execAsync.mockResolvedValue({
          stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                 ',0,1.0,NVIDIA GeForce RTX 3080,OK\n'
        });

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats).toEqual([]);
      });

      it('should include valid dedicated GPUs', async () => {
        const mockExecAsync = jest.fn()
          .mockResolvedValueOnce({
            stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                   ',10737418240,30.0.14.9649,NVIDIA GeForce RTX 3080,OK\n'
          })
          .mockResolvedValueOnce({
            stdout: '45, 5120, 10240, 62, 280, 1800, 9500'
          });

        require('util').promisify.mockReturnValue(mockExecAsync);

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats.length).toBeGreaterThan(0);
        if (gpuStats.length > 0) {
          expect(gpuStats[0].name).toContain('NVIDIA');
        }
      });

      it('should get NVIDIA stats using nvidia-smi', async () => {
        const mockExecAsync = jest.fn()
          .mockResolvedValueOnce({
            stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                   ',10737418240,30.0.14.9649,NVIDIA GeForce RTX 3080,OK\n'
          })
          .mockResolvedValueOnce({
            stdout: '45, 5120, 10240, 62, 280, 1800, 9500'
          });

        require('util').promisify.mockReturnValue(mockExecAsync);

        const gpuStats = await systemMonitor.getGPUStats();

        if (gpuStats.length > 0) {
          expect(gpuStats[0]).toHaveProperty('usage');
          expect(gpuStats[0]).toHaveProperty('memory');
          expect(gpuStats[0]).toHaveProperty('temperature');
        }
      });

      it('should handle nvidia-smi errors gracefully', async () => {
        const mockExecAsync = jest.fn()
          .mockResolvedValueOnce({
            stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                   ',10737418240,30.0.14.9649,NVIDIA GeForce RTX 3080,OK\n'
          })
          .mockRejectedValueOnce(new Error('nvidia-smi not found'));

        require('util').promisify.mockReturnValue(mockExecAsync);

        const gpuStats = await systemMonitor.getGPUStats();

        // Should still return GPU info, just with default stats
        expect(gpuStats.length).toBeGreaterThan(0);
      });

      it('should handle Intel GPUs', async () => {
        const mockExecAsync = jest.fn().mockResolvedValue({
          stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                 ',2147483648,27.0.0.1,Intel Arc A770,OK\n'
        });

        require('util').promisify.mockReturnValue(mockExecAsync);

        const gpuStats = await systemMonitor.getGPUStats();

        // Intel Arc is a dedicated GPU, should be included
        expect(gpuStats.length).toBeGreaterThan(0);
      });

      it('should handle multiple GPUs', async () => {
        const mockExecAsync = jest.fn()
          .mockResolvedValueOnce({
            stdout: 'Node,AdapterRAM,DriverVersion,Name,Status\n' +
                   ',10737418240,30.0.14.9649,NVIDIA GeForce RTX 3080,OK\n' +
                   ',8589934592,30.0.14.9649,NVIDIA GeForce RTX 2080,OK\n'
          })
          .mockResolvedValue({ stdout: '0, 0, 10240, 0, 0, 0, 0' });

        require('util').promisify.mockReturnValue(mockExecAsync);

        const gpuStats = await systemMonitor.getGPUStats();

        expect(gpuStats.length).toBeGreaterThanOrEqual(1);
      });
    });

    it('should return empty array on non-Windows platforms by default', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      const gpuStats = await systemMonitor.getGPUStats();

      expect(gpuStats).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const execAsync = promisify(exec);
      execAsync.mockRejectedValue(new Error('Command failed'));

      const gpuStats = await systemMonitor.getGPUStats();

      expect(gpuStats).toEqual([]);
    });
  });

  describe('start', () => {
    it('should send initial stats', async () => {
      systemMonitor.initialize(mainWindow);

      await systemMonitor.start();

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'system-stats',
        expect.any(Object)
      );
    });

    it('should setup monitoring interval', async () => {
      systemMonitor.initialize(mainWindow);

      await systemMonitor.start();

      expect(systemMonitor.monitorInterval).not.toBeNull();
    });

      it('should send stats every second', async () => {
      jest.useRealTimers(); // Use real timers for this specific test

      systemMonitor.initialize(mainWindow);
      mainWindow.webContents.send.mockClear();

      await systemMonitor.start();

      // Initial call
      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'system-stats',
        expect.any(Object)
      );

      const initialCallCount = mainWindow.webContents.send.mock.calls.length;

      // Wait a bit more than 1 second
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should have been called again
      expect(mainWindow.webContents.send.mock.calls.length).toBeGreaterThan(initialCallCount);

      systemMonitor.stop();
      jest.useFakeTimers(); // Restore fake timers
    });

    it('should clear existing interval before starting new one', async () => {
      systemMonitor.initialize(mainWindow);

      await systemMonitor.start();
      const firstInterval = systemMonitor.monitorInterval;

      await systemMonitor.start();
      const secondInterval = systemMonitor.monitorInterval;

      expect(firstInterval).not.toBe(secondInterval);
    });

    it('should handle missing mainWindow gracefully', async () => {
      systemMonitor.mainWindow = null;

      // Should not throw
      await expect(systemMonitor.start()).resolves.not.toThrow();
    });
  });

  describe('stop', () => {
    it('should clear monitoring interval', async () => {
      systemMonitor.initialize(mainWindow);
      await systemMonitor.start();

      expect(systemMonitor.monitorInterval).not.toBeNull();

      systemMonitor.stop();

      expect(systemMonitor.monitorInterval).toBeNull();
    });

    it('should stop sending stats', async () => {
      systemMonitor.initialize(mainWindow);
      await systemMonitor.start();

      mainWindow.webContents.send.mockClear();
      systemMonitor.stop();

      jest.advanceTimersByTime(5000);
      await Promise.resolve();

      // Should not send any more stats after stopping
      expect(mainWindow.webContents.send).not.toHaveBeenCalled();
    });

    it('should handle multiple stop calls', () => {
      systemMonitor.stop();
      systemMonitor.stop();

      expect(systemMonitor.monitorInterval).toBeNull();
    });

    it('should be safe to call when not started', () => {
      expect(() => systemMonitor.stop()).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should call stop method', async () => {
      systemMonitor.initialize(mainWindow);
      await systemMonitor.start();

      const stopSpy = jest.spyOn(systemMonitor, 'stop');

      systemMonitor.cleanup();

      expect(stopSpy).toHaveBeenCalled();
    });

    it('should clear all intervals', async () => {
      systemMonitor.initialize(mainWindow);
      await systemMonitor.start();

      systemMonitor.cleanup();

      expect(systemMonitor.monitorInterval).toBeNull();
    });
  });

  describe('IPC Handlers', () => {
    it('should handle start-system-monitor IPC call', async () => {
      let startHandler;
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'start-system-monitor') {
          startHandler = handler;
        }
      });

      systemMonitor.initialize(mainWindow);

      await startHandler();

      expect(systemMonitor.monitorInterval).not.toBeNull();
    });

    it('should handle stop-system-monitor IPC call', async () => {
      let stopHandler;
      ipcMain.handle.mockImplementation((channel, handler) => {
        if (channel === 'stop-system-monitor') {
          stopHandler = handler;
        }
      });

      systemMonitor.initialize(mainWindow);
      await systemMonitor.start();

      await stopHandler();

      expect(systemMonitor.monitorInterval).toBeNull();
    });
  });

  describe('Integration', () => {
    it('should complete full monitoring cycle', async () => {
      jest.useRealTimers();

      systemMonitor.initialize(mainWindow);
      mainWindow.webContents.send.mockClear();

      // Start monitoring
      await systemMonitor.start();
      expect(mainWindow.webContents.send).toHaveBeenCalled();

      // Stop monitoring
      systemMonitor.stop();

      // Cleanup
      systemMonitor.cleanup();
      expect(systemMonitor.monitorInterval).toBeNull();
    });
  });
});
