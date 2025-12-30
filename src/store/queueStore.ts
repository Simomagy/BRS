import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { QueueItem, QueueSettings, QueueState } from '@/types/queue';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_SETTINGS: QueueSettings = {
  autoStart: false,
  maxConcurrent: 1,
  defaultPriority: 0,
  defaultOutputPath: '',
};

interface QueueStore extends QueueState {
  // Azioni base
  addItem: (item: Omit<QueueItem, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => void;
  removeItem: (id: string) => void;
  updateItem: (id: string, updates: Partial<QueueItem>) => void;
  reorderItems: (items: QueueItem[]) => void;
  updateSettings: (settings: Partial<QueueSettings>) => void;

  // Azioni avanzate
  updatePriority: (id: string, priority: number) => void;
  addDependency: (id: string, dependencyId: string) => void;
  removeDependency: (id: string, dependencyId: string) => void;
  scheduleItem: (id: string, scheduledTime: string) => void;
  cancelSchedule: (id: string) => void;
  optimizeQueue: () => void;
  resetItem: (id: string) => void;
  resetAllItems: () => void;
}

export const useQueueStore = create<QueueStore>()(
  persist(
    (set, get) => ({
      items: [],
      isProcessing: false,
      processingInterval: null,
      settings: DEFAULT_SETTINGS,

      // Azioni base
      addItem: (item) => {
        const newItem: QueueItem = {
          ...item,
          id: uuidv4(),
          status: 'pending',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        set((state) => ({
          items: [...state.items, newItem],
        }));
      },

      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, ...updates, updatedAt: new Date().toISOString() }
              : item
          ),
        }));
      },

      reorderItems: (items) => {
        set({ items });
      },

      updateSettings: (settings) => {
        set((state) => ({
          settings: { ...state.settings, ...settings },
        }));
      },

      // Azioni avanzate
      updatePriority: (id, priority) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, priority, updatedAt: new Date().toISOString() }
              : item
          ),
        }));
      },

      addDependency: (id, dependencyId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  dependencies: [...(item.dependencies || []), dependencyId],
                  updatedAt: new Date().toISOString(),
                }
              : item
          ),
        }));
      },

      removeDependency: (id, dependencyId) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  dependencies: (item.dependencies || []).filter((d) => d !== dependencyId),
                  updatedAt: new Date().toISOString(),
                }
              : item
          ),
        }));
      },

      scheduleItem: (id, scheduledTime) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, scheduledTime, updatedAt: new Date().toISOString() }
              : item
          ),
        }));
      },

      cancelSchedule: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? { ...item, scheduledTime: undefined, updatedAt: new Date().toISOString() }
              : item
          ),
        }));
      },

      optimizeQueue: () => {
        const state = get();
        const { items } = state;

        // Ordina gli elementi per priorità e data di creazione
        const sortedItems = [...items].sort((a, b) => {
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        });

        // Raggruppa gli elementi per dipendenze
        const groupedItems = sortedItems.reduce((acc, item) => {
          const key = item.dependencies?.join(',') || 'none';
          if (!acc[key]) {
            acc[key] = [];
          }
          acc[key].push(item);
          return acc;
        }, {} as Record<string, QueueItem[]>);

        // Riordina gli elementi considerando le dipendenze
        const optimizedItems = Object.values(groupedItems).flat();

        set({ items: optimizedItems });
      },

      resetItem: (id: string) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: 'pending',
                  progress: undefined,
                  currentFrame: undefined,
                  totalFrames: undefined,
                  currentSample: undefined,
                  totalSamples: undefined,
                  inCompositing: undefined,
                  compositingOperation: undefined,
                }
              : item
          ),
        }));
      },

      resetAllItems: () => {
        set((state) => ({
          items: state.items.map((item) => ({
            ...item,
            status: 'pending',
            progress: undefined,
            currentFrame: undefined,
            totalFrames: undefined,
            currentSample: undefined,
            totalSamples: undefined,
            inCompositing: undefined,
            compositingOperation: undefined,
          })),
        }));
      },
    }),
    {
      name: 'queue-storage',
    }
  )
);

