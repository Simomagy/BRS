/**
 * Test per QueueProcessor
 * Service singleton per la gestione della coda di render
 */

// Mock di window.electronAPI
const mockExecuteCommand = jest.fn();
const mockStopProcess = jest.fn();
const mockOn = jest.fn();
const mockRemoveAllListeners = jest.fn();

(global as any).window = {
  electronAPI: {
    executeCommand: mockExecuteCommand,
    stopProcess: mockStopProcess,
    on: mockOn,
    removeAllListeners: mockRemoveAllListeners
  }
};

// Mock di useQueueStore
const mockUpdateItem = jest.fn();
const mockGetState = jest.fn();

jest.mock('@/store/queueStore', () => ({
  useQueueStore: {
    getState: mockGetState
  }
}));

import { queueProcessor } from '../../../src/services/queueProcessor';
import { createMockQueueItem, delay } from '../../setup/test-utils';
import { QueueItem } from '@/types/queue';

describe('QueueProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock default
    mockGetState.mockReturnValue({
      items: [],
      updateItem: mockUpdateItem
    });

    mockExecuteCommand.mockResolvedValue({ id: 'process-123' });
    mockStopProcess.mockResolvedValue(undefined);

    // Reset processor state
    (queueProcessor as any).isProcessing = false;
    (queueProcessor as any).currentProcesses.clear();
  });

  afterEach(async () => {
    // Ferma il processore per cleanup
    queueProcessor.stopProcessing();
    await delay(100);
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = (queueProcessor.constructor as any).getInstance();
      const instance2 = (queueProcessor.constructor as any).getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('startProcessing', () => {
    it('should set isProcessing to true', async () => {
      queueProcessor.startProcessing();

      expect((queueProcessor as any).isProcessing).toBe(true);

      queueProcessor.stopProcessing();
      await delay(100);
    });

    it('should not start if already processing', async () => {
      (queueProcessor as any).isProcessing = true;

      await queueProcessor.startProcessing();

      // Non dovrebbe cambiare stato
      expect((queueProcessor as any).isProcessing).toBe(true);
    });

    it('should process queue items', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      queueProcessor.startProcessing();

      // Attendi che il processo venga avviato
      await delay(200);

      expect(mockExecuteCommand).toHaveBeenCalledWith(mockItem.command);

      queueProcessor.stopProcessing();
      await delay(100);
    });
  });

  describe('stopProcessing', () => {
    it('should set isProcessing to false', () => {
      (queueProcessor as any).isProcessing = true;

      queueProcessor.stopProcessing();

      expect((queueProcessor as any).isProcessing).toBe(false);
    });

    it('should stop all running processes', async () => {
      const mockItem = createMockQueueItem();
      (queueProcessor as any).currentProcesses.set(mockItem.id, 'process-123');

      queueProcessor.stopProcessing();

      expect(mockStopProcess).toHaveBeenCalledWith('process-123');
    });

    it('should clear currentProcesses map', () => {
      (queueProcessor as any).currentProcesses.set('item-1', 'process-1');
      (queueProcessor as any).currentProcesses.set('item-2', 'process-2');

      queueProcessor.stopProcessing();

      expect((queueProcessor as any).currentProcesses.size).toBe(0);
    });
  });

  describe('findNextItem', () => {
    const findNextItem = (items: QueueItem[]) =>
      (queueProcessor as any).findNextItem(items);

    it('should return undefined if no pending items', () => {
      const items = [
        createMockQueueItem({ status: 'completed' }),
        createMockQueueItem({ status: 'failed' })
      ];

      const next = findNextItem(items);

      expect(next).toBeUndefined();
    });

    it('should return first pending item', () => {
      const item1 = createMockQueueItem({ status: 'pending' });
      const item2 = createMockQueueItem({ status: 'running' });

      const next = findNextItem([item1, item2]);

      expect(next).toBe(item1);
    });

    it('should prioritize items by priority level', () => {
      const lowPriority = createMockQueueItem({ priority: 1, status: 'pending' });
      const highPriority = createMockQueueItem({ priority: 5, status: 'pending' });
      const mediumPriority = createMockQueueItem({ priority: 3, status: 'pending' });

      const next = findNextItem([lowPriority, highPriority, mediumPriority]);

      expect(next).toBe(highPriority);
    });

    it('should use creation time as tie-breaker for same priority', () => {
      const olderItem = createMockQueueItem({
        priority: 1,
        status: 'pending',
        createdAt: '2024-01-01T00:00:00Z'
      });
      const newerItem = createMockQueueItem({
        priority: 1,
        status: 'pending',
        createdAt: '2024-01-02T00:00:00Z'
      });

      const next = findNextItem([newerItem, olderItem]);

      expect(next).toBe(olderItem);
    });

    it('should skip items with future scheduledTime', () => {
      const futureTime = new Date(Date.now() + 3600000).toISOString(); // +1 ora
      const scheduled = createMockQueueItem({
        status: 'pending',
        scheduledTime: futureTime
      });
      const immediate = createMockQueueItem({ status: 'pending' });

      const next = findNextItem([scheduled, immediate]);

      expect(next).toBe(immediate);
    });

    it('should include items with past scheduledTime', () => {
      const pastTime = new Date(Date.now() - 3600000).toISOString(); // -1 ora
      const scheduled = createMockQueueItem({
        status: 'pending',
        scheduledTime: pastTime
      });

      const next = findNextItem([scheduled]);

      expect(next).toBe(scheduled);
    });

    it('should skip items with uncompleted dependencies', () => {
      const dep1 = createMockQueueItem({ status: 'completed' });
      const dep2 = createMockQueueItem({ status: 'pending' });
      const dependent = createMockQueueItem({
        status: 'pending',
        dependencies: [dep1.id, dep2.id]
      });

      mockGetState.mockReturnValue({
        items: [dep1, dep2, dependent],
        updateItem: mockUpdateItem
      });

      const next = findNextItem([dep1, dep2, dependent]);

      expect(next).not.toBe(dependent);
    });

    it('should include items with all completed dependencies', () => {
      const dep1 = createMockQueueItem({ status: 'completed' });
      const dep2 = createMockQueueItem({ status: 'completed' });
      const dependent = createMockQueueItem({
        status: 'pending',
        dependencies: [dep1.id, dep2.id]
      });

      mockGetState.mockReturnValue({
        items: [dep1, dep2, dependent],
        updateItem: mockUpdateItem
      });

      const next = findNextItem([dep1, dep2, dependent]);

      expect(next).toBe(dependent);
    });

    it('should skip items already in currentProcesses', () => {
      const item = createMockQueueItem({ status: 'pending' });
      (queueProcessor as any).currentProcesses.set(item.id, 'process-123');

      const next = findNextItem([item]);

      expect(next).toBeUndefined();
    });
  });

  describe('startProcess', () => {
    it('should update item status to running', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id, { status: 'running' });
    });

    it('should execute command via electronAPI', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockExecuteCommand).toHaveBeenCalledWith(mockItem.command);
    });

    it('should add process to currentProcesses map', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });
      mockExecuteCommand.mockResolvedValue({ id: 'process-456' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect((queueProcessor as any).currentProcesses.get(mockItem.id)).toBe('process-456');
    });

    it('should setup progress event listener', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });
      mockExecuteCommand.mockResolvedValue({ id: 'process-789' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockOn).toHaveBeenCalledWith(
        'progress-process-789',
        expect.any(Function)
      );
    });

    it('should setup complete event listener', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });
      mockExecuteCommand.mockResolvedValue({ id: 'process-111' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockOn).toHaveBeenCalledWith(
        'complete-process-111',
        expect.any(Function)
      );
    });

    it('should setup error event listener', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });
      mockExecuteCommand.mockResolvedValue({ id: 'process-222' });

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockOn).toHaveBeenCalledWith(
        'error-process-222',
        expect.any(Function)
      );
    });

    it('should handle executeCommand errors', async () => {
      const mockItem = createMockQueueItem({ status: 'pending' });
      mockExecuteCommand.mockRejectedValue(new Error('Command failed'));

      mockGetState.mockReturnValue({
        items: [mockItem],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).startProcess(mockItem);

      expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id, { status: 'failed' });
    });

    describe('Event Handlers', () => {
      it('should update progress on progress event', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-333' });

        let progressCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'progress-process-333') {
            progressCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);

        // Simula evento progress
        progressCallback({
          progress: 50,
          currentFrame: 5,
          totalFrames: 10
        });

        expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id,
          expect.objectContaining({
            progress: 50,
            currentFrame: 5,
            totalFrames: 10
          })
        );
      });

      it('should mark as completed on complete event with code 0', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-444' });

        let completeCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'complete-process-444') {
            completeCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);

        // Simula completamento
        completeCallback(0);

        expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id, { status: 'completed' });
      });

      it('should mark as failed on complete event with non-zero code', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-555' });

        let completeCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'complete-process-555') {
            completeCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);

        // Simula errore
        completeCallback(1);

        expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id, { status: 'failed' });
      });

      it('should mark as failed on error event', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-666' });

        let errorCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'error-process-666') {
            errorCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);

        // Simula errore
        errorCallback('Error message');

        expect(mockUpdateItem).toHaveBeenCalledWith(mockItem.id, { status: 'failed' });
      });

      it('should remove process from currentProcesses on complete', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-777' });

        let completeCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'complete-process-777') {
            completeCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);
        expect((queueProcessor as any).currentProcesses.has(mockItem.id)).toBe(true);

        // Simula completamento
        completeCallback(0);

        expect((queueProcessor as any).currentProcesses.has(mockItem.id)).toBe(false);
      });

      it('should remove process from currentProcesses on error', async () => {
        const mockItem = createMockQueueItem({ status: 'pending' });
        mockExecuteCommand.mockResolvedValue({ id: 'process-888' });

        let errorCallback: any;
        mockOn.mockImplementation((event: string, callback: any) => {
          if (event === 'error-process-888') {
            errorCallback = callback;
          }
        });

        mockGetState.mockReturnValue({
          items: [mockItem],
          updateItem: mockUpdateItem
        });

        await (queueProcessor as any).startProcess(mockItem);
        expect((queueProcessor as any).currentProcesses.has(mockItem.id)).toBe(true);

        // Simula errore
        errorCallback('Error message');

        expect((queueProcessor as any).currentProcesses.has(mockItem.id)).toBe(false);
      });
    });
  });

  describe('stopProcess', () => {
    it('should call electronAPI.stopProcess', async () => {
      const itemId = 'item-123';
      (queueProcessor as any).currentProcesses.set(itemId, 'process-999');

      mockGetState.mockReturnValue({
        items: [],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).stopProcess(itemId);

      expect(mockStopProcess).toHaveBeenCalledWith('process-999');
    });

    it('should remove process from currentProcesses', async () => {
      const itemId = 'item-456';
      (queueProcessor as any).currentProcesses.set(itemId, 'process-000');

      mockGetState.mockReturnValue({
        items: [],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).stopProcess(itemId);

      expect((queueProcessor as any).currentProcesses.has(itemId)).toBe(false);
    });

    it('should reset item status to pending', async () => {
      const itemId = 'item-789';
      (queueProcessor as any).currentProcesses.set(itemId, 'process-111');

      mockGetState.mockReturnValue({
        items: [],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).stopProcess(itemId);

      expect(mockUpdateItem).toHaveBeenCalledWith(itemId, { status: 'pending' });
    });

    it('should do nothing if process not found', async () => {
      mockGetState.mockReturnValue({
        items: [],
        updateItem: mockUpdateItem
      });

      await (queueProcessor as any).stopProcess('non-existent');

      expect(mockStopProcess).not.toHaveBeenCalled();
    });
  });

  describe('setMaxConcurrent', () => {
    it('should update maxConcurrent value', () => {
      queueProcessor.setMaxConcurrent(5);

      expect((queueProcessor as any).maxConcurrent).toBe(5);
    });

    it('should accept different values', () => {
      queueProcessor.setMaxConcurrent(1);
      expect((queueProcessor as any).maxConcurrent).toBe(1);

      queueProcessor.setMaxConcurrent(10);
      expect((queueProcessor as any).maxConcurrent).toBe(10);
    });
  });

  describe('Integration', () => {
    it('should process multiple items sequentially', async () => {
      const item1 = createMockQueueItem({ status: 'pending', priority: 1 });
      const item2 = createMockQueueItem({ status: 'pending', priority: 2 });

      let completeCallback1: any;
      let completeCallback2: any;

      mockExecuteCommand
        .mockResolvedValueOnce({ id: 'process-1' })
        .mockResolvedValueOnce({ id: 'process-2' });

      mockOn.mockImplementation((event: string, callback: any) => {
        if (event === 'complete-process-1') completeCallback1 = callback;
        if (event === 'complete-process-2') completeCallback2 = callback;
      });

      mockGetState.mockReturnValue({
        items: [item1, item2],
        updateItem: mockUpdateItem
      });

      queueProcessor.startProcessing();

      // Attendi che il primo processo venga avviato
      await delay(200);

      // Il secondo non dovrebbe essere avviato ancora (max concurrent = 1)
      expect(mockExecuteCommand).toHaveBeenCalledTimes(1);

      // Completa il primo processo
      completeCallback1(0);
      await delay(1100); // Attendi il ciclo di polling

      // Ora il secondo dovrebbe essere avviato
      expect(mockExecuteCommand).toHaveBeenCalledTimes(2);

      queueProcessor.stopProcessing();
      await delay(100);
    });
  });
});
