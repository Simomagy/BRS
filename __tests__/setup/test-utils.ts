/**
 * Utilities condivise per i test
 */

import { resetElectronMocks } from './electron-mocks';

// Setup globale prima di ogni test
beforeEach(() => {
  resetElectronMocks();
});

// Cleanup dopo ogni test
afterEach(() => {
  jest.clearAllMocks();
});

/**
 * Helper per creare mock di event sender (IPC)
 */
export const createMockSender = () => ({
  send: jest.fn(),
  getId: jest.fn().mockReturnValue(1)
});

/**
 * Helper per aspettare un evento specifico
 */
export const waitForEvent = (emitter: any, event: string, timeout = 5000): Promise<any> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${event}`));
    }, timeout);

    emitter.once(event, (...args: any[]) => {
      clearTimeout(timer);
      resolve(args.length === 1 ? args[0] : args);
    });
  });
};

/**
 * Helper per aspettare che una condizione diventi vera
 */
export const waitFor = async (
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> => {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
};

/**
 * Helper per creare mock di comando Blender
 */
export const createMockBlenderCommand = (options: {
  executable?: string;
  blendFile?: string;
  output?: string;
  frame?: number;
  startFrame?: number;
  endFrame?: number;
  engine?: string;
} = {}): string => {
  const {
    executable = 'C:\\Blender\\blender.exe',
    blendFile = 'C:\\test\\scene.blend',
    output = 'C:\\output\\render_####.png',
    frame,
    startFrame,
    endFrame,
    engine = 'CYCLES'
  } = options;

  let command = `"${executable}" -b "${blendFile}" -o "${output}"`;

  if (engine !== 'CYCLES') {
    command += ` -E ${engine}`;
  }

  if (frame !== undefined) {
    command += ` -f ${frame}`;
  } else if (startFrame !== undefined && endFrame !== undefined) {
    command += ` -s ${startFrame} -e ${endFrame} -a`;
  }

  return command;
};

/**
 * Helper per creare mock di QueueItem
 */
export const createMockQueueItem = (overrides: any = {}) => ({
  id: `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Render',
  command: createMockBlenderCommand(),
  status: 'pending' as const,
  priority: 1,
  createdAt: new Date().toISOString(),
  dependencies: [],
  scheduledTime: null,
  progress: 0,
  ...overrides
});

/**
 * Helper per creare mock di Preset
 */
export const createMockPreset = (overrides: any = {}) => ({
  id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  name: 'Test Preset',
  description: 'Preset di test',
  category: 'test',
  settings: {
    engine: 'CYCLES',
    samples: 128,
    resolution: { x: 1920, y: 1080 },
    format: 'PNG',
    quality: 100
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides
});

/**
 * Helper per simulare delay
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Helper per creare mock di system stats
 */
export const createMockSystemStats = (overrides: any = {}) => ({
  cpu: {
    usage: 45.5,
    cores: 8,
    model: 'Intel Core i7-9700K'
  },
  memory: {
    total: 16 * 1024 * 1024 * 1024, // 16GB
    used: 8 * 1024 * 1024 * 1024,   // 8GB
    free: 8 * 1024 * 1024 * 1024,   // 8GB
    percentage: 50
  },
  gpu: {
    name: 'NVIDIA GeForce RTX 3080',
    usage: 0,
    memory: {
      total: 10 * 1024, // 10GB in MB
      used: 0,
      free: 10 * 1024
    },
    temperature: 45
  },
  timestamp: Date.now(),
  ...overrides
});

/**
 * Matcher personalizzati per Jest
 */
export const customMatchers = {
  toBeValidProcessId(received: any) {
    const pass = typeof received === 'string' && /^process-\d+-[a-z0-9]+$/.test(received);
    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be a valid process ID`
        : `expected ${received} to be a valid process ID (format: process-timestamp-random)`
    };
  },

  toBeValidQueueId(received: any) {
    const pass = typeof received === 'string' && /^queue-\d+-[a-z0-9]+$/.test(received);
    return {
      pass,
      message: () => pass
        ? `expected ${received} not to be a valid queue ID`
        : `expected ${received} to be a valid queue ID (format: queue-timestamp-random)`
    };
  }
};

// Estendi i matcher di Jest
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidProcessId(): R;
      toBeValidQueueId(): R;
    }
  }
}

// Aggiungi i matcher personalizzati
if (typeof expect !== 'undefined') {
  expect.extend(customMatchers);
}
