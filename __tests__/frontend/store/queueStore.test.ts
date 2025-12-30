/**
 * Test per queueStore
 * Zustand store per gestione coda render con persistenza
 */

// Mock di uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => `mock-uuid-${Date.now()}-${Math.random()}`)
}));

// Mock di zustand/middleware persist
jest.mock('zustand/middleware', () => ({
  persist: (config: any, options: any) => config
}));

import { useQueueStore } from '../../../src/store/queueStore';
import { QueueItem } from '../../../src/types/queue';
import { createMockQueueItem } from '../../setup/test-utils';

describe('queueStore', () => {
  beforeEach(() => {
    // Reset store state prima di ogni test
    useQueueStore.setState({
      items: [],
      isProcessing: false,
      processingInterval: null,
      settings: {
        autoStart: false,
        maxConcurrent: 1,
        defaultPriority: 0,
        defaultOutputPath: ''
      }
    });
  });

  describe('Initial State', () => {
    it('should have empty items array', () => {
      const state = useQueueStore.getState();
      expect(state.items).toEqual([]);
    });

    it('should not be processing initially', () => {
      const state = useQueueStore.getState();
      expect(state.isProcessing).toBe(false);
    });

    it('should have default settings', () => {
      const state = useQueueStore.getState();
      expect(state.settings).toEqual({
        autoStart: false,
        maxConcurrent: 1,
        defaultPriority: 0,
        defaultOutputPath: ''
      });
    });
  });

  describe('addItem', () => {
    it('should add item to queue', () => {
      const { addItem } = useQueueStore.getState();

      addItem({
        name: 'Test Render',
        command: 'blender -b scene.blend',
        priority: 1
      });

      const state = useQueueStore.getState();
      expect(state.items).toHaveLength(1);
    });

    it('should generate unique ID for new item', () => {
      const { addItem } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });

      const state = useQueueStore.getState();
      expect(state.items[0].id).toBeDefined();
      expect(state.items[1].id).toBeDefined();
      expect(state.items[0].id).not.toBe(state.items[1].id);
    });

    it('should set status to pending', () => {
      const { addItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });

      const state = useQueueStore.getState();
      expect(state.items[0].status).toBe('pending');
    });

    it('should set createdAt timestamp', () => {
      const { addItem } = useQueueStore.getState();
      const beforeTime = new Date().getTime();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });

      const afterTime = new Date().getTime();
      const state = useQueueStore.getState();
      const createdTime = new Date(state.items[0].createdAt).getTime();

      expect(createdTime).toBeGreaterThanOrEqual(beforeTime);
      expect(createdTime).toBeLessThanOrEqual(afterTime);
    });

    it('should set updatedAt timestamp', () => {
      const { addItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });

      const state = useQueueStore.getState();
      expect(state.items[0].updatedAt).toBeDefined();
    });

    it('should preserve custom properties', () => {
      const { addItem } = useQueueStore.getState();

      addItem({
        name: 'Custom Render',
        command: 'blender -b scene.blend',
        priority: 5,
        dependencies: ['dep-1'],
        scheduledTime: '2024-12-31T23:59:59Z'
      });

      const state = useQueueStore.getState();
      expect(state.items[0].priority).toBe(5);
      expect(state.items[0].dependencies).toEqual(['dep-1']);
      expect(state.items[0].scheduledTime).toBe('2024-12-31T23:59:59Z');
    });
  });

  describe('removeItem', () => {
    it('should remove item from queue', () => {
      const { addItem, removeItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      removeItem(itemId);

      const state = useQueueStore.getState();
      expect(state.items).toHaveLength(0);
    });

    it('should preserve other items', () => {
      const { addItem, removeItem } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });
      addItem({ name: 'Item 3', command: 'cmd3', priority: 1 });

      const items = useQueueStore.getState().items;
      removeItem(items[1].id);

      const state = useQueueStore.getState();
      expect(state.items).toHaveLength(2);
      expect(state.items[0].name).toBe('Item 1');
      expect(state.items[1].name).toBe('Item 3');
    });

    it('should do nothing for non-existent ID', () => {
      const { addItem, removeItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });

      removeItem('non-existent-id');

      const state = useQueueStore.getState();
      expect(state.items).toHaveLength(1);
    });
  });

  describe('updateItem', () => {
    it('should update item properties', () => {
      const { addItem, updateItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      updateItem(itemId, { status: 'running', progress: 50 });

      const state = useQueueStore.getState();
      expect(state.items[0].status).toBe('running');
      expect(state.items[0].progress).toBe(50);
    });

    it('should update updatedAt timestamp', async () => {
      const { addItem, updateItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;
      const originalUpdatedAt = useQueueStore.getState().items[0].updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      updateItem(itemId, { status: 'running' });

      const state = useQueueStore.getState();
      expect(state.items[0].updatedAt).not.toBe(originalUpdatedAt);
    });

    it('should preserve unchanged properties', () => {
      const { addItem, updateItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'original-cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      updateItem(itemId, { status: 'running' });

      const state = useQueueStore.getState();
      expect(state.items[0].command).toBe('original-cmd');
      expect(state.items[0].name).toBe('Test');
    });

    it('should update only matching item', () => {
      const { addItem, updateItem } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });

      const items = useQueueStore.getState().items;
      updateItem(items[0].id, { status: 'running' });

      const state = useQueueStore.getState();
      expect(state.items[0].status).toBe('running');
      expect(state.items[1].status).toBe('pending');
    });
  });

  describe('reorderItems', () => {
    it('should reorder items', () => {
      const { addItem, reorderItems } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });
      addItem({ name: 'Item 3', command: 'cmd3', priority: 1 });

      const items = useQueueStore.getState().items;
      reorderItems([items[2], items[0], items[1]]);

      const state = useQueueStore.getState();
      expect(state.items[0].name).toBe('Item 3');
      expect(state.items[1].name).toBe('Item 1');
      expect(state.items[2].name).toBe('Item 2');
    });

    it('should replace entire items array', () => {
      const { addItem, reorderItems } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });

      const newItems = [createMockQueueItem({ name: 'New Item' })];
      reorderItems(newItems);

      const state = useQueueStore.getState();
      expect(state.items).toEqual(newItems);
    });
  });

  describe('updateSettings', () => {
    it('should update settings', () => {
      const { updateSettings } = useQueueStore.getState();

      updateSettings({ autoStart: true, maxConcurrent: 3 });

      const state = useQueueStore.getState();
      expect(state.settings.autoStart).toBe(true);
      expect(state.settings.maxConcurrent).toBe(3);
    });

    it('should preserve unchanged settings', () => {
      const { updateSettings } = useQueueStore.getState();

      updateSettings({ autoStart: true });

      const state = useQueueStore.getState();
      expect(state.settings.maxConcurrent).toBe(1);
      expect(state.settings.defaultPriority).toBe(0);
    });
  });

  describe('updatePriority', () => {
    it('should update item priority', () => {
      const { addItem, updatePriority } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      updatePriority(itemId, 5);

      const state = useQueueStore.getState();
      expect(state.items[0].priority).toBe(5);
    });

    it('should update updatedAt timestamp', async () => {
      const { addItem, updatePriority } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;
      const originalUpdatedAt = useQueueStore.getState().items[0].updatedAt;

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      updatePriority(itemId, 5);

      const state = useQueueStore.getState();
      expect(state.items[0].updatedAt).not.toBe(originalUpdatedAt);
    });
  });

  describe('addDependency', () => {
    it('should add dependency to item', () => {
      const { addItem, addDependency } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      addDependency(itemId, 'dep-1');

      const state = useQueueStore.getState();
      expect(state.items[0].dependencies).toContain('dep-1');
    });

    it('should preserve existing dependencies', () => {
      const { addItem, addDependency } = useQueueStore.getState();

      addItem({
        name: 'Test',
        command: 'cmd',
        priority: 1,
        dependencies: ['dep-1']
      });
      const itemId = useQueueStore.getState().items[0].id;

      addDependency(itemId, 'dep-2');

      const state = useQueueStore.getState();
      expect(state.items[0].dependencies).toContain('dep-1');
      expect(state.items[0].dependencies).toContain('dep-2');
    });

    it('should initialize dependencies array if undefined', () => {
      const { addItem, addDependency } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      addDependency(itemId, 'dep-1');

      const state = useQueueStore.getState();
      expect(Array.isArray(state.items[0].dependencies)).toBe(true);
    });
  });

  describe('removeDependency', () => {
    it('should remove dependency from item', () => {
      const { addItem, removeDependency } = useQueueStore.getState();

      addItem({
        name: 'Test',
        command: 'cmd',
        priority: 1,
        dependencies: ['dep-1', 'dep-2']
      });
      const itemId = useQueueStore.getState().items[0].id;

      removeDependency(itemId, 'dep-1');

      const state = useQueueStore.getState();
      expect(state.items[0].dependencies).not.toContain('dep-1');
      expect(state.items[0].dependencies).toContain('dep-2');
    });

    it('should handle empty dependencies array', () => {
      const { addItem, removeDependency } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      removeDependency(itemId, 'non-existent');

      const state = useQueueStore.getState();
      expect(state.items[0].dependencies || []).toEqual([]);
    });
  });

  describe('scheduleItem', () => {
    it('should set scheduledTime', () => {
      const { addItem, scheduleItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;
      const scheduledTime = '2024-12-31T23:59:59Z';

      scheduleItem(itemId, scheduledTime);

      const state = useQueueStore.getState();
      expect(state.items[0].scheduledTime).toBe(scheduledTime);
    });
  });

  describe('cancelSchedule', () => {
    it('should remove scheduledTime', () => {
      const { addItem, cancelSchedule } = useQueueStore.getState();

      addItem({
        name: 'Test',
        command: 'cmd',
        priority: 1,
        scheduledTime: '2024-12-31T23:59:59Z'
      });
      const itemId = useQueueStore.getState().items[0].id;

      cancelSchedule(itemId);

      const state = useQueueStore.getState();
      expect(state.items[0].scheduledTime).toBeUndefined();
    });
  });

  describe('optimizeQueue', () => {
    it('should sort items by priority', () => {
      const { addItem, optimizeQueue } = useQueueStore.getState();

      addItem({ name: 'Low', command: 'cmd', priority: 1 });
      addItem({ name: 'High', command: 'cmd', priority: 5 });
      addItem({ name: 'Medium', command: 'cmd', priority: 3 });

      optimizeQueue();

      const state = useQueueStore.getState();
      expect(state.items[0].name).toBe('High');
      expect(state.items[1].name).toBe('Medium');
      expect(state.items[2].name).toBe('Low');
    });

    it('should use creation time as tie-breaker', async () => {
      const { addItem, optimizeQueue } = useQueueStore.getState();

      addItem({
        name: 'First',
        command: 'cmd',
        priority: 1
      });

      // Small delay to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));

      addItem({
        name: 'Second',
        command: 'cmd',
        priority: 1
      });

      optimizeQueue();

      const state = useQueueStore.getState();
      expect(state.items[0].name).toBe('First');
      expect(state.items[1].name).toBe('Second');
    });
  });

  describe('resetItem', () => {
    it('should reset item status to pending', () => {
      const { addItem, resetItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      useQueueStore.getState().updateItem(itemId, { status: 'completed' });
      resetItem(itemId);

      const state = useQueueStore.getState();
      expect(state.items[0].status).toBe('pending');
    });

    it('should clear progress information', () => {
      const { addItem, resetItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 1 });
      const itemId = useQueueStore.getState().items[0].id;

      useQueueStore.getState().updateItem(itemId, {
        progress: 75,
        currentFrame: 5,
        totalFrames: 10,
        currentSample: 32,
        totalSamples: 64
      });

      resetItem(itemId);

      const state = useQueueStore.getState();
      expect(state.items[0].progress).toBeUndefined();
      expect(state.items[0].currentFrame).toBeUndefined();
      expect(state.items[0].totalFrames).toBeUndefined();
      expect(state.items[0].currentSample).toBeUndefined();
      expect(state.items[0].totalSamples).toBeUndefined();
    });

    it('should preserve other item properties', () => {
      const { addItem, resetItem } = useQueueStore.getState();

      addItem({ name: 'Test', command: 'cmd', priority: 5 });
      const itemId = useQueueStore.getState().items[0].id;

      resetItem(itemId);

      const state = useQueueStore.getState();
      expect(state.items[0].name).toBe('Test');
      expect(state.items[0].command).toBe('cmd');
      expect(state.items[0].priority).toBe(5);
    });
  });

  describe('resetAllItems', () => {
    it('should reset all items to pending', () => {
      const { addItem, resetAllItems } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });

      useQueueStore.getState().updateItem(
        useQueueStore.getState().items[0].id,
        { status: 'completed' }
      );
      useQueueStore.getState().updateItem(
        useQueueStore.getState().items[1].id,
        { status: 'failed' }
      );

      resetAllItems();

      const state = useQueueStore.getState();
      expect(state.items[0].status).toBe('pending');
      expect(state.items[1].status).toBe('pending');
    });

    it('should clear progress from all items', () => {
      const { addItem, resetAllItems } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 1 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 1 });

      useQueueStore.getState().updateItem(
        useQueueStore.getState().items[0].id,
        { progress: 50 }
      );
      useQueueStore.getState().updateItem(
        useQueueStore.getState().items[1].id,
        { progress: 75 }
      );

      resetAllItems();

      const state = useQueueStore.getState();
      expect(state.items[0].progress).toBeUndefined();
      expect(state.items[1].progress).toBeUndefined();
    });

    it('should preserve other item properties', () => {
      const { addItem, resetAllItems } = useQueueStore.getState();

      addItem({ name: 'Item 1', command: 'cmd1', priority: 5 });
      addItem({ name: 'Item 2', command: 'cmd2', priority: 3 });

      resetAllItems();

      const state = useQueueStore.getState();
      expect(state.items[0].name).toBe('Item 1');
      expect(state.items[0].priority).toBe(5);
      expect(state.items[1].name).toBe('Item 2');
      expect(state.items[1].priority).toBe(3);
    });
  });
});
