export interface HistoryItem {
	id: string;
	name: string;
	command: string;
	status: 'completed' | 'failed' | 'stopped';
	startTime: string;
	endTime: string;
	duration: number; // in secondi
	progress: number;
	currentFrame: number;
	totalFrames: number;
	currentSample: number;
	totalSamples: number;
	error?: string;
	parameters: {
		blenderVersion: string;
		renderEngine: string;
		outputPath: string;
		outputDirectory?: string;
		totalFrames: number;
		lastUsed: string;
	};
}
