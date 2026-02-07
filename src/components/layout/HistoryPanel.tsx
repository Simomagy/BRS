import React, { useEffect, useState } from 'react';
import { useHistoryStore } from '@/store/historyStore';
import { HistoryItem } from '@/types/history';
import { formatDistanceToNow, format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Trash2, Info, CheckCircle2, XCircle, AlertCircle, FolderOpen, FileWarning } from 'lucide-react';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';

const HistoryItemStatus: React.FC<{ status: string }> = ({ status }) => {
	const getStatusColor = (status: string) => {
		switch (status) {
			case 'completed':
				return 'text-green-500';
			case 'failed':
				return 'text-red-500';
			case 'stopped':
				return 'text-yellow-500';
			default:
				return 'text-gray-500';
		}
	};

	const getStatusLabel = (status: string) => {
		switch (status) {
			case 'completed':
				return 'Completed';
			case 'failed':
				return 'Failed';
			case 'stopped':
				return 'Stopped';
			default:
				return status;
		}
	};

	return (
		<Badge variant="outline" className={getStatusColor(status)}>
			{getStatusLabel(status)}
		</Badge>
	);
};

const formatDuration = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const remainingSeconds = seconds % 60;
	return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const HistoryItemDetails: React.FC<{
	item: HistoryItem;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}> = ({ item, open, onOpenChange }) => {
	const handleOpenResult = async () => {
		if (!window.electronAPI) return;

		// Usa outputDirectory se disponibile, altrimenti estrai dalla outputPath
		const folderPath = item.parameters.outputDirectory ||
			item.parameters.outputPath.split(/[\\/]/).slice(0, -1).join('/');

		if (folderPath) {
			await window.electronAPI.openPath(folderPath);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl overflow-hidden">
				<DialogHeader>
					<DialogTitle>Render History Details</DialogTitle>
					<DialogDescription>Detailed information about the completed render</DialogDescription>
				</DialogHeader>
				<div className="space-y-6 py-4 overflow-y-auto max-h-[80vh]">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Name</h4>
							<p className="text-sm truncate">{item.name}</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Status</h4>
							<p className={`text-sm ${item.status === 'completed' ? 'text-green-500' : item.status === 'failed' ? 'text-red-500' : 'text-yellow-500'}`}>
								{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
							</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Start Time</h4>
							<p className="text-sm">
								{format(new Date(item.startTime), "PPP 'at' HH:mm")}
							</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">End Time</h4>
							<p className="text-sm">
								{format(new Date(item.endTime), "PPP 'at' HH:mm")}
							</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Duration</h4>
							<p className="text-sm">{formatDuration(item.duration)}</p>
						</div>
					</div>

					{item.totalFrames > 0 && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Frame Progress</h4>
							<p className="text-sm">
								{item.currentFrame}/{item.totalFrames} frames
							</p>
							<Progress
								value={(item.currentFrame / item.totalFrames) * 100}
								className="h-2"
							/>
						</div>
					)}

					<div className="space-y-2">
						<h4 className="text-sm font-medium text-muted-foreground">Overall Progress</h4>
						<p className="text-sm">{item.progress.toFixed(1)}%</p>
						<Progress value={item.progress} className="h-2" />
					</div>

					{item.error && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Error</h4>
							<p className="text-sm text-red-500 break-words">{item.error}</p>
						</div>
					)}

					<div className="space-y-2">
						<h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
						<div className="bg-neutral-950 p-4 rounded-lg">
							<div className="space-y-3">
								<div className="flex justify-between items-center">
									<span className="text-sm text-muted-foreground">Blender Version:</span>
									<span className="text-sm">{item.parameters.blenderVersion}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-muted-foreground">Render Engine:</span>
									<span className="text-sm">{item.parameters.renderEngine}</span>
								</div>
								<div className="flex justify-between items-center gap-4">
									<span className="text-sm text-muted-foreground">Output:</span>
									<Button
										variant="outline"
										size="sm"
										onClick={handleOpenResult}
										className="gap-2"
									>
										<FolderOpen className="h-3 w-3" />
										Open Result
									</Button>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-muted-foreground">Total Frames:</span>
									<span className="text-sm">{item.parameters.totalFrames}</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-sm text-muted-foreground">Last Used:</span>
									<span className="text-sm">{format(new Date(item.parameters.lastUsed), "PPP 'at' HH:mm")}</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};

const HistoryPanel: React.FC = () => {
	const items = useHistoryStore((state) => state.items);
	const clearHistory = useHistoryStore((state) => state.clearHistory);
	const loadHistory = useHistoryStore((state) => state.loadHistory);
	const removeItem = useHistoryStore((state) => state.removeItem);
	const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);

	// Carica la history all'avvio del componente
	useEffect(() => {
		loadHistory();
	}, [loadHistory]);

	return (
		<div className="flex flex-col h-full">
			<div className="flex-none p-4 border-b">
				<div className="flex items-center justify-center">
					<Button
						variant="ghost"
						size="sm"
						onClick={clearHistory}
						disabled={items.length === 0}
						className="text-destructive hover:text-destructive w-full"
					>
						<Trash2 className="h-4 w-4 mr-2" />
						Clear History
					</Button>
				</div>
			</div>

			<ScrollArea className="flex-1 overflow-y-auto">
				<div className="p-4 flex flex-col gap-4">
					{items.length === 0 ? (
						<div className="text-center text-muted-foreground py-8">
							<FileWarning className="h-10 w-10 mx-auto mb-4" />
							No render history available
						</div>
					) : (
						items.map((item) => (
							<ContextMenu key={item.id}>
								<ContextMenuTrigger>
									<div
										className="bg-neutral-900 rounded-lg p-4 border border-transparent cursor-pointer hover:border-neutral-700 transition-all duration-200"
										onClick={() => setSelectedItem(item)}
									>
										<div className="flex items-center justify-between mb-2">
											<div className="flex items-center gap-2">
												{item.status === 'completed' ? (
													<CheckCircle2 className="h-5 w-5 text-green-500" />
												) : item.status === 'failed' ? (
													<XCircle className="h-5 w-5 text-red-500" />
												) : (
													<AlertCircle className="h-5 w-5 text-yellow-500" />
												)}
												<span className="font-medium">{item.name}</span>
											</div>
											<span className="text-sm text-muted-foreground">
												{format(new Date(item.startTime), "PPP 'at' HH:mm")}
											</span>
										</div>
										<div className="space-y-2">
											<div className="flex justify-between items-center">
												<span className="text-sm text-muted-foreground">Duration</span>
												<span className="text-sm">{formatDuration(item.duration)}</span>
											</div>
											<div className="flex justify-between items-center">
												<span className="text-sm text-muted-foreground">Blender {item.parameters.blenderVersion}</span>
												<span className="text-sm">{item.parameters.renderEngine}</span>
											</div>
											{item.parameters.totalFrames > 0 && (
												<div className="flex justify-between items-center">
													<span className="text-sm text-muted-foreground">Frames</span>
													<span className="text-sm">{item.currentFrame}/{item.parameters.totalFrames}</span>
												</div>
											)}
											<div className="flex justify-between items-center">
												<span className="text-sm text-muted-foreground">Progress</span>
												<span className="text-sm">{item.progress.toFixed(1)}%</span>
											</div>
											<Progress value={item.progress} className="h-2" />
											<Button
												variant="outline"
												size="sm"
												onClick={(e) => {
													e.stopPropagation();
													const folderPath = item.parameters.outputDirectory ||
														item.parameters.outputPath.split(/[\\/]/).slice(0, -1).join('/');
													if (folderPath && window.electronAPI) {
														window.electronAPI.openPath(folderPath);
													}
												}}
												className="w-full gap-2 mt-2"
											>
												<FolderOpen className="h-3 w-3" />
												Open Result
											</Button>
										</div>
									</div>
								</ContextMenuTrigger>
								<ContextMenuContent>
									<ContextMenuItem
										className="text-destructive focus:text-destructive"
										onClick={() => removeItem(item.id)}
									>
										<Trash2 className="h-4 w-4 mr-2" />
										Delete Entry
									</ContextMenuItem>
									<ContextMenuItem
										onClick={() => {
											setSelectedItem(item);
										}}
									>
										<Info className="h-4 w-4 mr-2" />
										Open Info
									</ContextMenuItem>
								</ContextMenuContent>
							</ContextMenu>
						))
					)}
				</div>
			</ScrollArea>

			{selectedItem && (
				<HistoryItemDetails
					item={selectedItem}
					open={!!selectedItem}
					onOpenChange={(open) => !open && setSelectedItem(null)}
				/>
			)}
		</div>
	);
};

export default HistoryPanel;
