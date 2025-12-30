const { ipcMain } = require('electron');
const os = require('os');

class SystemMonitor {
  constructor() {
    this.monitorInterval = null;
    this.mainWindow = null;
  }

  /**
   * Initialize the system monitor
   * @param {BrowserWindow} window - The main window to send stats to
   */
  initialize(window) {
    this.mainWindow = window;
    this.registerHandlers();
  }

  /**
   * Register IPC handlers for system monitoring
   */
  registerHandlers() {
    ipcMain.handle('start-system-monitor', async () => {
      return this.start();
    });

    ipcMain.handle('stop-system-monitor', async () => {
      return this.stop();
    });
  }

  /**
   * Get GPU statistics
   */
  async getGPUStats() {
    const gpuStats = [];

    if (process.platform === 'win32') {
      try {
        const { exec } = require('child_process');
        const { promisify } = require('util');
        const execAsync = promisify(exec);

        // Get detailed GPU info excluding virtual monitors
        const gpuInfoCommand = 'wmic path win32_VideoController get name,AdapterRAM,DriverVersion,Status /format:csv';
        const { stdout: gpuInfo } = await execAsync(gpuInfoCommand);

        // Filter to exclude virtual GPUs, monitors, and integrated graphics
        const virtualGPUKeywords = [
          'virtual', 'monitor', 'remote', 'vnc', 'rdp', 'teamviewer',
          'parsec', 'meta', 'desktop', 'software', 'basic', 'standard'
        ];

        // Filter to exclude integrated graphics (common patterns)
        const integratedGPUKeywords = [
          'uhd graphics', 'hd graphics', 'iris', 'vega', 'radeon graphics',
          'integrated', 'onboard', 'chipset', 'shared', 'family'
        ];

        // Parse GPU info
        const lines = gpuInfo.split('\n').filter(line => line.trim() && !line.includes('Node'));
        const validGPUs = [];

        for (const line of lines) {
          const parts = line.split(',');
          if (parts.length >= 4) {
            const adapterRAM = parseInt(parts[1]) || 0;
            const name = (parts[3] || 'Unknown GPU').trim();
            const status = (parts[4] || '').trim();

            // Skip if GPU name contains virtual keywords or has no memory
            const isVirtual = virtualGPUKeywords.some(keyword =>
              name.toLowerCase().includes(keyword.toLowerCase())
            );

            // Skip if GPU is integrated graphics
            const isIntegrated = integratedGPUKeywords.some(keyword =>
              name.toLowerCase().includes(keyword.toLowerCase())
            );

            // Only include GPUs that are OK status, have memory, are not virtual, and are not integrated
            if (!isVirtual && !isIntegrated && status.toLowerCase() === 'ok' && adapterRAM > 0) {
              validGPUs.push({ name, adapterRAM });
            }
          }
        }

        // Now get real-time data for each valid GPU
        for (const gpu of validGPUs) {
          let gpuData = {
            name: gpu.name,
            usage: '0%',
            memory: {
              used: '0 GB',
              total: `${Math.floor(gpu.adapterRAM / 1024 / 1024 / 1024)} GB`,
              percentage: '0%'
            },
            temperature: 'N/A',
            power: 'N/A'
          };

          // Try to get NVIDIA GPU stats using nvidia-smi
          if (gpu.name.toLowerCase().includes('nvidia')) {
            try {
              const nvidiaCommand = 'nvidia-smi --query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,clocks.gr,clocks.mem --format=csv,noheader,nounits';
              const { stdout: nvidiaStats } = await execAsync(nvidiaCommand);

              const lines = nvidiaStats.trim().split('\n');
              if (lines.length > 0) {
                const stats = lines[0].split(',').map(s => s.trim());
                if (stats.length >= 7) {
                  const usage = parseInt(stats[0]) || 0;
                  const memoryUsed = parseFloat(stats[1]) || 0;
                  const memoryTotal = parseFloat(stats[2]) || 0;
                  const temperature = parseInt(stats[3]) || 0;
                  const power = parseFloat(stats[4]) || 0;
                  const coreClock = parseInt(stats[5]) || 0;
                  const memoryClock = parseInt(stats[6]) || 0;

                  gpuData = {
                    name: gpu.name,
                    usage: `${usage}%`,
                    memory: {
                      used: `${(memoryUsed / 1024).toFixed(1)} GB`,
                      total: `${(memoryTotal / 1024).toFixed(0)} GB`,
                      percentage: `${memoryTotal > 0 ? Math.round((memoryUsed / memoryTotal) * 100) : 0}%`
                    },
                    temperature: `${temperature}°C`,
                    power: `${power.toFixed(0)}W`,
                    coreClock: `${coreClock} MHz`,
                    memoryClock: `${memoryClock} MHz`
                  };
                }
              }
            } catch (nvidiaError) {
              console.log('nvidia-smi not available or failed:', nvidiaError.message);
            }
          }

          // Try to get Intel GPU stats using Intel Arc Control (if available)
          else if (gpu.name.toLowerCase().includes('intel')) {
            try {
              // For Intel GPUs, we can try to use Windows Performance Counters
              const intelCommand = 'typeperf "\\GPU Engine(*)\\Utilization Percentage" -sc 1';
              const { stdout: intelStats } = await execAsync(intelCommand);

              // Parse Intel GPU utilization (this is a simplified approach)
              const utilizationMatch = intelStats.match(/(\d+\.?\d*)/);
              if (utilizationMatch) {
                const usage = Math.round(parseFloat(utilizationMatch[1]));
                gpuData.usage = `${usage}%`;
              }
            } catch (intelError) {
              console.log('Intel GPU monitoring not available:', intelError.message);
            }
          }

          // Try to get AMD GPU stats using AMD software (if available)
          else if (gpu.name.toLowerCase().includes('amd') || gpu.name.toLowerCase().includes('radeon')) {
            try {
              // For AMD GPUs, try to use WMI queries for GPU performance
              const amdCommand = 'wmic path Win32_PerfRawData_GPUPerformanceCounters_GPUEngine get Name,UtilizationPercentage /format:csv';
              const { stdout: amdStats } = await execAsync(amdCommand);

              // This would need more sophisticated parsing for AMD GPUs
              console.log('AMD GPU detection attempted');
            } catch (amdError) {
              console.log('AMD GPU monitoring not available:', amdError.message);
            }
          }

          gpuStats.push(gpuData);
        }

      } catch (error) {
        console.error('Error getting GPU stats:', error);
      }
    }

    // If no valid GPUs found, don't add any fallback data
    return gpuStats;
  }

  /**
   * Get system statistics
   */
  async getSystemStats() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // Calculate CPU usage (simplified approach)
    const cpuUsage = cpus.reduce((acc, cpu) => {
      const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
      const idle = cpu.times.idle;
      return acc + ((total - idle) / total) * 100;
    }, 0) / cpus.length;

    // Get GPU stats
    const gpuStats = await this.getGPUStats();

    return {
      cpu: {
        usage: `${cpuUsage.toFixed(1)}%`,
        cores: cpus.map(cpu => `${cpu.model} @ ${cpu.speed}MHz`)
      },
      memory: {
        used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
        percentage: `${((usedMem / totalMem) * 100).toFixed(1)}%`
      },
      gpu: gpuStats
    };
  }

  /**
   * Start monitoring system stats
   */
  async start() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    // Send initial stats
    if (this.mainWindow) {
      const stats = await this.getSystemStats();
      this.mainWindow.webContents.send('system-stats', stats);
    }

    // Start monitoring every 1 second
    this.monitorInterval = setInterval(async () => {
      if (this.mainWindow) {
        const stats = await this.getSystemStats();
        this.mainWindow.webContents.send('system-stats', stats);
      }
    }, 1000);
  }

  /**
   * Stop monitoring system stats
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Cleanup on app exit
   */
  cleanup() {
    this.stop();
  }
}

module.exports = SystemMonitor;
