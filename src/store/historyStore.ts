import { create } from 'zustand';
import { HistoryItem } from '@/types/history';
import { v4 as uuidv4 } from 'uuid';

interface HistoryState {
	items: HistoryItem[];
	addItem: (item: Omit<HistoryItem, 'id'>) => void;
	clearHistory: () => void;
	loadHistory: () => Promise<void>;
	removeItem: (id: string) => void;
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
	items: [],
	addItem: (item) => {
		const newItem = {
			...item,
			id: uuidv4(),
		};

		set((state) => {
			const newItems = [newItem, ...state.items]; // Aggiungi all'inizio per avere i più recenti in alto
			// Salva la history aggiornata
			window.electronAPI.saveHistory(newItems);
			return { items: newItems };
		});
	},
	clearHistory: () => {
		set({ items: [] });
		// Salva la history vuota
		window.electronAPI.saveHistory([]);
	},
	loadHistory: async () => {
		try {
			// Carica la history salvata
			const savedHistory = await window.electronAPI.loadHistory();
			// Verifica che i dati siano del tipo corretto
			if (Array.isArray(savedHistory) && savedHistory.every(item =>
				typeof item === 'object' &&
				item !== null &&
				'id' in item &&
				'command' in item &&
				'status' in item
			)) {
				set({ items: savedHistory });
			} else {
				console.warn('Invalid history data format, resetting to empty array');
				set({ items: [] });
				window.electronAPI.saveHistory([]);
			}
		} catch (error) {
			console.error('Error loading history:', error);
			set({ items: [] });
		}
	},
	removeItem: (id) => {
		set((state) => {
			const newItems = state.items.filter((item) => item.id !== id);
			window.electronAPI.saveHistory(newItems);
			return { items: newItems };
		});
	},
}));
