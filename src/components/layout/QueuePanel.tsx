import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQueueStore } from '@/store/queueStore';
import { QueueItem } from '@/types/queue';
import { toast } from 'sonner';
import { queueProcessor } from '@/services/queueProcessor';
import {
	Play,
	Square,
	Trash2,
	Clock,
	CheckCircle2,
	XCircle,
	Loader2,
	MoreVertical,
	ArrowUpDown,
	Calendar,
	Link,
	Settings,
	GripVertical,
	AlertCircle,
	RotateCcw,
	Info,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	DragDropContext,
	Droppable,
	Draggable,
	DropResult,
	DroppableProvided,
	DraggableProvided,
} from '@hello-pangea/dnd';
import { Badge } from '@/components/ui/badge';
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
} from '@/components/ui/context-menu';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from '@/components/ui/dialog';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Separator } from '../ui/separator';
import { Progress } from '@/components/ui/progress';

// Componenti separati per una migliore organizzazione
const QueueItemStatus: React.FC<{ status: string }> = ({ status }) => {
	const getStatusColor = (status: string) => {
		switch (status) {
			case 'pending':
				return 'text-yellow-500';
			case 'running':
				return 'text-blue-500';
			case 'completed':
				return 'text-green-500';
			case 'failed':
				return 'text-red-500';
			default:
				return 'text-gray-500';
		}
	};

	const getStatusIcon = (status: string) => {
		switch (status) {
			case 'pending':
				return <Clock className="h-4 w-4" />;
			case 'running':
				return <Loader2 className="h-4 w-4 animate-spin" />;
			case 'completed':
				return <CheckCircle2 className="h-4 w-4" />;
			case 'failed':
				return <XCircle className="h-4 w-4" />;
			default:
				return null;
		}
	};

	return <div className={getStatusColor(status)}>{getStatusIcon(status)}</div>;
};

const QueueItemPriority: React.FC<{ priority: number }> = ({ priority }) => {
	const getPriorityColor = (priority: number) => {
		switch (priority) {
			case 2:
				return 'bg-red-500/20 text-red-500';
			case 1:
				return 'bg-yellow-500/20 text-yellow-500';
			default:
				return 'bg-blue-500/20 text-blue-500';
		}
	};

	const getPriorityLabel = (priority: number) => {
		switch (priority) {
			case 2:
				return 'High';
			case 1:
				return 'Medium';
			default:
				return 'Low';
		}
	};

	return (
		<Badge variant="outline" className={getPriorityColor(priority)}>
			{getPriorityLabel(priority)}
		</Badge>
	);
};

const QueueItemInfo: React.FC<{ item: QueueItem }> = ({ item }) => (
	<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
		<span>Added {formatDistanceToNow(new Date(item.createdAt))} ago</span>
		<QueueItemPriority priority={item.priority} />
		{item.dependencies && item.dependencies.length > 0 && (
			<Badge variant="secondary">{item.dependencies.length} dependencies</Badge>
		)}
		{item.scheduledTime && (
			<Badge variant="secondary">
				Scheduled for {format(new Date(item.scheduledTime), "PPP 'at' HH:mm")}
			</Badge>
		)}
		{item.status === 'running' && (
			<>
				{item.totalFrames && (
					<Badge variant="secondary">
						Frame {item.currentFrame}/{item.totalFrames}
					</Badge>
				)}
				{item.totalSamples && (
					<Badge variant="secondary">
						Samples {item.currentSample}/{item.totalSamples}
					</Badge>
				)}
				{item.progress !== undefined && (
					<Badge variant="secondary">
						{item.progress.toFixed(1)}%
					</Badge>
				)}
			</>
		)}
	</div>
);

const DetailsDialog: React.FC<{
	item: QueueItem;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	items: QueueItem[];
}> = ({ item, open, onOpenChange, items }) => {
	const getStatusColor = (status: string) => {
		switch (status) {
			case 'pending':
				return 'text-yellow-500';
			case 'running':
				return 'text-blue-500';
			case 'completed':
				return 'text-green-500';
			case 'failed':
				return 'text-red-500';
			default:
				return 'text-gray-500';
		}
	};

	const getPriorityLabel = (priority: number) => {
		switch (priority) {
			case 2:
				return 'High';
			case 1:
				return 'Medium';
			default:
				return 'Low';
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Render Details</DialogTitle>
					<DialogDescription>Detailed information about the render job</DialogDescription>
				</DialogHeader>
				<div className="space-y-6 py-4">
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Name</h4>
							<p className="text-sm">{item.name}</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Status</h4>
							<p className={`text-sm ${getStatusColor(item.status)}`}>
								{item.status.charAt(0).toUpperCase() + item.status.slice(1)}
							</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Priority</h4>
							<p className="text-sm">{getPriorityLabel(item.priority)}</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Created</h4>
							<p className="text-sm">
								{format(new Date(item.createdAt), "PPP 'at' HH:mm")}
							</p>
						</div>
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Last Updated</h4>
							<p className="text-sm">
								{format(new Date(item.updatedAt), "PPP 'at' HH:mm")}
							</p>
						</div>
						{item.scheduledTime && (
							<div className="space-y-2">
								<h4 className="text-sm font-medium text-muted-foreground">
									Scheduled For
								</h4>
								<p className="text-sm">
									{format(new Date(item.scheduledTime), "PPP 'at' HH:mm")}
								</p>
							</div>
						)}
					</div>

					{item.dependencies && item.dependencies.length > 0 && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Dependencies</h4>
							<div className="flex flex-wrap gap-2">
								{item.dependencies.map((depId) => {
									const depItem = items.find((i: QueueItem) => i.id === depId);
									return (
										<Badge key={depId} variant="secondary">
											{depItem?.name || depId}
										</Badge>
									);
								})}
							</div>
						</div>
					)}

					{item.status === 'running' && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Progress</h4>
							<div className="space-y-2">
								{item.totalFrames && item.currentFrame !== undefined && (
									<div>
										<p className="text-sm mb-1">
											Frame {item.currentFrame}/{item.totalFrames}
										</p>
										<Progress
											value={(item.currentFrame / item.totalFrames) * 100}
											className="h-2"
										/>
									</div>
								)}
								{item.totalSamples && item.currentSample !== undefined && (
									<div>
										<p className="text-sm mb-1">
											Samples {item.currentSample}/{item.totalSamples}
										</p>
										<Progress
											value={(item.currentSample / item.totalSamples) * 100}
											className="h-2"
										/>
									</div>
								)}
								{item.progress !== undefined && (
									<div>
										<p className="text-sm mb-1">
											Overall Progress: {item.progress.toFixed(1)}%
										</p>
										<Progress value={item.progress} className="h-2" />
									</div>
								)}
							</div>
						</div>
					)}

					{item.parameters && (
						<div className="space-y-2">
							<h4 className="text-sm font-medium text-muted-foreground">Parameters</h4>
							<pre className="bg-neutral-950 p-4 rounded-lg overflow-x-auto">
								<code className="text-sm">
									{JSON.stringify(item.parameters, null, 2)}
								</code>
							</pre>
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

const QueueItemActions: React.FC<{
	item: QueueItem;
	onUpdatePriority: (id: string, priority: number) => void;
	onAddDependency: (id: string, dependencyId: string) => void;
	onRemoveDependency: (id: string, dependencyId: string) => void;
	onSchedule: (item: QueueItem) => void;
	onRemove: (id: string) => void;
	onReset: (id: string) => void;
	onShowDetails: (item: QueueItem) => void;
	items: QueueItem[];
	provided: DraggableProvided;
}> = ({
	item,
	onUpdatePriority,
	onAddDependency,
	onRemoveDependency,
	onSchedule,
	onRemove,
	onReset,
	onShowDetails,
	items,
	provided,
}) => (
	<ContextMenu>
		<ContextMenuTrigger>
			<div
				ref={provided.innerRef}
				{...provided.draggableProps}
				className="flex items-center justify-between p-4 bg-neutral-900 rounded-lg border border-transparent hover:border-neutral-700 transition-all duration-200 select-none"
			>
				<div className="flex items-center space-x-4">
					<div {...provided.dragHandleProps} className="cursor-grab">
						<GripVertical className="h-4 w-4 text-muted-foreground" />
					</div>
					<QueueItemStatus status={item.status} />
					<div className="flex-1">
						<div className="font-medium">{item.name}</div>
						<QueueItemInfo item={item} />
						{item.status === 'running' && item.progress !== undefined && (
							<div className="mt-2">
								<Progress value={item.progress} className="h-2" />
							</div>
						)}
					</div>
				</div>
			</div>
		</ContextMenuTrigger>
		<ContextMenuContent>
			<ContextMenuLabel>Actions</ContextMenuLabel>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={() => onShowDetails(item)}>
				<Info className="h-4 w-4 mr-2" />
				View Details
			</ContextMenuItem>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Settings className="h-4 w-4 mr-2" />
					Set Priority
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ContextMenuRadioGroup
						value={item.priority.toString()}
						onValueChange={(value) => onUpdatePriority(item.id, parseInt(value))}
						className="flex flex-col gap-2"
					>
						<ContextMenuRadioItem value="0" className="text-xs text-blue-500">
							Low
						</ContextMenuRadioItem>
						<ContextMenuRadioItem value="1" className="text-xs text-yellow-500">
							Medium
						</ContextMenuRadioItem>
						<ContextMenuRadioItem value="2" className="text-xs text-red-500">
							High
						</ContextMenuRadioItem>
					</ContextMenuRadioGroup>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuSub>
				<ContextMenuSubTrigger>
					<Link className="h-4 w-4 mr-2" />
					Manage Dependencies
				</ContextMenuSubTrigger>
				<ContextMenuSubContent>
					<ScrollArea className="h-[200px]">
						<div className="space-y-2 p-2">
							{items
								.filter((i) => i.id !== item.id)
								.map((depItem) => (
									<div
										key={depItem.id}
										className="flex items-center justify-between p-2 bg-neutral-950 rounded-lg"
									>
										<span>{depItem.name}</span>
										<Button
											variant="ghost"
											size="sm"
											onClick={() => {
												if (item.dependencies?.includes(depItem.id)) {
													onRemoveDependency(item.id, depItem.id);
												} else {
													onAddDependency(item.id, depItem.id);
												}
											}}
										>
											{item.dependencies?.includes(depItem.id) ? 'Remove' : 'Add'}
										</Button>
									</div>
								))}
						</div>
					</ScrollArea>
				</ContextMenuSubContent>
			</ContextMenuSub>
			<ContextMenuItem onSelect={() => onSchedule(item)}>
				<Calendar className="h-4 w-4 mr-2" />
				Schedule
			</ContextMenuItem>
			<ContextMenuItem onClick={() => onReset(item.id)}>
				<RotateCcw className="h-4 w-4 mr-2" />
				Reset Status
			</ContextMenuItem>
			<ContextMenuItem onClick={() => onRemove(item.id)} className="text-red-500">
				<Trash2 className="h-4 w-4 mr-2" />
				Remove
			</ContextMenuItem>
		</ContextMenuContent>
	</ContextMenu>
);

const ScheduleDialog: React.FC<{
	item: QueueItem;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSchedule: (id: string, date: Date | undefined, time: string) => void;
	onCancelSchedule: (id: string) => void;
}> = ({ item, open, onOpenChange, onSchedule, onCancelSchedule }) => {
	const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
	const [selectedTime, setSelectedTime] = useState<string>('00:00');
	const [selectedHour, setSelectedHour] = useState<number>(0);
	const [selectedPeriod, setSelectedPeriod] = useState<'AM' | 'PM'>('AM');
	const [selectedMinutes, setSelectedMinutes] = useState<string>('00');

	const isDateDisabled = (date: Date) => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return date < today;
	};

	const isTimeDisabled = (
		hour: number,
		period: 'AM' | 'PM',
		minutes: string
	) => {
		const now = new Date();
		const selectedDateTime = new Date(selectedDate || now);

		const selectedHour24 =
			period === 'PM' ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;
		selectedDateTime.setHours(selectedHour24, parseInt(minutes), 0, 0);

		if (selectedDateTime.toDateString() === now.toDateString()) {
			return selectedDateTime <= now;
		}

		return false;
	};

	const handleTimeChange = (
		type: 'hour' | 'period' | 'minutes',
		value: string
	) => {
		if (type === 'hour') {
			const hour = parseInt(value);
			setSelectedHour(hour);
			const newTime = `${hour.toString().padStart(2, '0')}:${selectedMinutes}`;
			setSelectedTime(newTime);
		} else if (type === 'period') {
			setSelectedPeriod(value as 'AM' | 'PM');
			const hour = selectedHour % 12;
			const newHour =
				value === 'PM' ? (hour === 0 ? 12 : hour + 12) : hour === 0 ? 0 : hour;
			const newTime = `${newHour.toString().padStart(2, '0')}:${selectedMinutes}`;
			setSelectedTime(newTime);
		} else {
			setSelectedMinutes(value);
			const newTime = `${selectedHour.toString().padStart(2, '0')}:${value}`;
			setSelectedTime(newTime);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Schedule Render</DialogTitle>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<Alert>
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							The application must be running for scheduled renders to work.
						</AlertDescription>
					</Alert>
					<div className="space-y-2 w-full">
						<Label>Date</Label>
						<CalendarComponent
							mode="single"
							selected={
								item.scheduledTime ? new Date(item.scheduledTime) : selectedDate
							}
							onSelect={(date) => {
								setSelectedDate(date);
								if (date) {
									const now = new Date();
									if (date.toDateString() === now.toDateString()) {
										const nextQuarter = new Date(now);
										nextQuarter.setMinutes(Math.ceil(now.getMinutes() / 15) * 15);
										nextQuarter.setSeconds(0);
										nextQuarter.setMilliseconds(0);

										const hours = nextQuarter.getHours();
										const minutes = nextQuarter.getMinutes();

										setSelectedHour(hours % 12 || 12);
										setSelectedPeriod(hours >= 12 ? 'PM' : 'AM');
										setSelectedMinutes(minutes.toString().padStart(2, '0'));
										setSelectedTime(
											`${hours.toString().padStart(2, '0')}:${minutes
												.toString()
												.padStart(2, '0')}`
										);
									} else {
										setSelectedHour(12);
										setSelectedPeriod('AM');
										setSelectedMinutes('00');
										setSelectedTime('00:00');
									}
								}
							}}
							disabled={isDateDisabled}
							initialFocus
						/>
					</div>
					<div className="space-y-2">
						<Label>Time</Label>
						<div className="flex gap-2 items-center">
							<Select
								value={selectedHour.toString().padStart(2, '0')}
								onValueChange={(value) => handleTimeChange('hour', value)}
							>
								<SelectTrigger className="w-fit">
									<SelectValue placeholder="Hour" />
								</SelectTrigger>
								<SelectContent>
									{Array.from({ length: 12 }, (_, i) => {
										const hour = i + 1;
										const isDisabled = isTimeDisabled(
											hour,
											selectedPeriod,
											selectedMinutes
										);
										return (
											<SelectItem
												key={hour}
												value={hour.toString().padStart(2, '0')}
												disabled={isDisabled}
											>
												{hour}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
							<span className="text-muted-foreground">:</span>
							<Select
								value={selectedMinutes}
								onValueChange={(value) => {
									if (!isTimeDisabled(selectedHour, selectedPeriod, value)) {
										handleTimeChange('minutes', value);
									}
								}}
							>
								<SelectTrigger className="w-[80px]">
									<SelectValue placeholder="Minutes" />
								</SelectTrigger>
								<SelectContent>
									{Array.from({ length: 60 }, (_, i) => {
										const value = i.toString().padStart(2, '0');
										return (
											<SelectItem
												key={value}
												value={value}
												disabled={isTimeDisabled(selectedHour, selectedPeriod, value)}
											>
												{value}
											</SelectItem>
										);
									})}
								</SelectContent>
							</Select>
							<Select
								value={selectedPeriod}
								onValueChange={(value) => {
									const newPeriod = value as 'AM' | 'PM';
									if (!isTimeDisabled(selectedHour, newPeriod, selectedMinutes)) {
										handleTimeChange('period', value);
									}
								}}
							>
								<SelectTrigger className="w-[80px]">
									<SelectValue placeholder="AM/PM" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="AM">AM</SelectItem>
									<SelectItem value="PM">PM</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>
					{item.scheduledTime ? (
						<Button
							variant="destructive"
							size="sm"
							className="w-full"
							onClick={() => {
								onCancelSchedule(item.id);
								onOpenChange(false);
							}}
						>
							Cancel Schedule
						</Button>
					) : (
						<Button
							variant="default"
							size="sm"
							className="w-full"
							onClick={() => {
								if (selectedDate) {
									const selectedDateTime = new Date(selectedDate);
									const [hours, minutes] = selectedTime.split(':');
									selectedDateTime.setHours(
										selectedPeriod === 'PM' ? parseInt(hours) + 12 : parseInt(hours),
										parseInt(minutes),
										0,
										0
									);

									if (selectedDateTime <= new Date()) {
										toast.error('Invalid time', {
											description: 'Please select a future date and time.',
										});
										return;
									}

									onSchedule(item.id, selectedDate, selectedTime);
									onOpenChange(false);
								} else {
									toast.error('Please select a date', {
										description: 'You need to select a date before scheduling.',
									});
								}
							}}
						>
							Schedule Render
						</Button>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
};

const QueuePanel: React.FC = () => {
	const {
		items,
		isProcessing,
		removeItem,
		updatePriority,
		addDependency,
		removeDependency,
		scheduleItem,
		cancelSchedule,
		optimizeQueue,
		reorderItems,
		resetItem,
		resetAllItems,
	} = useQueueStore();
	const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
	const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
	const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);

	const handleScheduleItem = (
		id: string,
		date: Date | undefined,
		time: string
	) => {
		if (date) {
			const [hours, minutes] = time.split(':');
			const scheduledDate = new Date(date);
			scheduledDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
			scheduleItem(id, scheduledDate.toISOString());
		}
	};

	const handleStartStop = () => {
		if (isProcessing) {
			queueProcessor.stopProcessing();
			toast.info('Queue Processing Stopped', {
				description: 'The queue processing has been stopped.',
			});
		} else {
			queueProcessor.startProcessing();
			toast.info('Queue Processing Started', {
				description: 'The queue processing has started.',
			});
		}
	};

	const handleDragEnd = (result: DropResult) => {
		if (!result.destination) return;

		const newItems = Array.from(items);
		const [reorderedItem] = newItems.splice(result.source.index, 1);
		newItems.splice(result.destination.index, 0, reorderedItem);

		reorderItems(newItems);
	};

	const handleResetAll = () => {
		resetAllItems();
		toast.info('Queue Reset', {
			description: 'All items have been reset to pending status.',
		});
	};

	const handleShowDetails = (item: QueueItem) => {
		setSelectedItem(item);
		setDetailsDialogOpen(true);
	};

	return (
		<>
			<div className="flex items-center justify-end gap-2 w-full">
				<Button variant="ghost" size="sm" onClick={optimizeQueue} className="h-8">
					<ArrowUpDown className="h-4 w-4 mr-2" />
					Optimize
				</Button>
				<Button variant="ghost" size="sm" onClick={handleResetAll} className="h-8">
					<RotateCcw className="h-4 w-4 mr-2" />
					Reset All
				</Button>
				<Button
					variant={isProcessing ? 'destructive' : 'shadow'}
					color={isProcessing ? 'destructive' : 'success'}
					size="sm"
					onClick={handleStartStop}
				>
					{isProcessing ? (
						<>
							<Square className="h-4 w-4 mr-2" />
							Stop Queue
						</>
					) : (
						<>
							<Play className="h-4 w-4 mr-2" />
							Start Queue
						</>
					)}
				</Button>
			</div>
			<Separator className="my-6" />
			<ScrollArea className="h-[400px]">
				<DragDropContext onDragEnd={handleDragEnd}>
					<Droppable droppableId="queue">
						{(provided: DroppableProvided) => (
							<div
								{...provided.droppableProps}
								ref={provided.innerRef}
								className="space-y-4"
							>
								{items.length === 0 ? (
									<div className="text-center text-sm text-muted-foreground py-4">
										No items in queue
									</div>
								) : (
									<div className="flex flex-col gap-2">
										{items.map((item, index) => (
											<Draggable
												key={item.id}
												draggableId={item.id}
												index={index}
												isDragDisabled={isProcessing}
											>
												{(provided: DraggableProvided) => (
													<QueueItemActions
														item={item}
														onUpdatePriority={updatePriority}
														onAddDependency={addDependency}
														onRemoveDependency={removeDependency}
														onSchedule={(item) => {
															setSelectedItem(item);
															setScheduleDialogOpen(true);
														}}
														onRemove={removeItem}
														onReset={resetItem}
														onShowDetails={handleShowDetails}
														items={items}
														provided={provided}
													/>
												)}
											</Draggable>
										))}
									</div>
								)}
								{provided.placeholder}
							</div>
						)}
					</Droppable>
				</DragDropContext>
			</ScrollArea>

			{selectedItem && (
				<>
					<ScheduleDialog
						item={selectedItem}
						open={scheduleDialogOpen}
						onOpenChange={setScheduleDialogOpen}
						onSchedule={handleScheduleItem}
						onCancelSchedule={cancelSchedule}
					/>
					<DetailsDialog
						item={selectedItem}
						open={detailsDialogOpen}
						onOpenChange={setDetailsDialogOpen}
						items={items}
					/>
				</>
			)}
		</>
	);
};

export default QueuePanel;
