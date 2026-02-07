import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Play,
  Square,
  RotateCcw,
  Timer,
  Frame,
  Layers,
  Cpu,
  History,
  Plus,
  Monitor,
  Thermometer,
  Zap,
  Clock,
  User,
  MemoryStick,
  HardDrive,
  Terminal,
  AlertTriangle,
  AlertCircle,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQueueStore } from "@/store/queueStore";
import { useHistoryStore } from "@/store/historyStore";
import { HistoryItem } from "@/types/history";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import HistoryPanel from "./HistoryPanel";
import { Badge } from "@/components/ui/badge";
import { LogEntry, LogLevel } from "./LogViewer";

interface RenderPanelProps {
  command: string;
  logs: LogEntry[];
  onAddLog: (message: string, level?: LogLevel) => void;
  onToggleLogPanel: () => void;
  isLogPanelVisible: boolean;
  externalProcessId?: string | null;
  onExternalProcessHandled?: () => void;
}

interface ProgressEventData {
  progress?: number;
  currentFrame?: number;
  totalFrames?: number;
  memoryUsage?: number;
  peakMemory?: number;
  currentSample?: number;
  totalSamples?: number;
  inCompositing?: boolean;
  compositingOperation?: string;
  currentTile?: number;
  totalTiles?: number;
  remainingTime?: string;
}

interface SystemStats {
  cpu: {
    usage: string;
    cores: string[];
  };
  memory: {
    used: string;
    total: string;
    percentage: string;
  };
  gpu: Array<{
    name: string;
    usage: string;
    memory: {
      used: string;
      total: string;
      percentage: string;
    };
    temperature: string;
    power: string;
    coreClock?: string;
    memoryClock?: string;
  }>;
}

const RenderPanel: React.FC<RenderPanelProps> = ({
  command,
  logs,
  onAddLog,
  onToggleLogPanel,
  isLogPanelVisible,
  externalProcessId = null,
  onExternalProcessHandled,
}) => {
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [currentSample, setCurrentSample] = useState(0);
  const [totalSamples, setTotalSamples] = useState(0);
  const [inCompositing, setInCompositing] = useState(false);
  const [compositingOperation, setCompositingOperation] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [peakMemory, setPeakMemory] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [queueName, setQueueName] = useState("");
  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [currentTile, setCurrentTile] = useState(0);
  const [totalTiles, setTotalTiles] = useState(0);
  const [remainingTime, setRemainingTime] = useState<string>("");
  const [samplesDetected, setSamplesDetected] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [renderCompleted, setRenderCompleted] = useState(false);
  const addItem = useQueueStore((state) => state.addItem);
  const addHistoryItem = useHistoryStore((state) => state.addItem);
  const [historyOpen, setHistoryOpen] = useState(false);
  const items = useHistoryStore((state) => state.items);
  const renderStartTimeRef = useRef<Date | null>(null);

  // Rate limiting for logs and toasts
  const logBufferRef = useRef<string[]>([]);
  const lastLogFlushRef = useRef<number>(Date.now());
  const toastCountRef = useRef<{ error: number, warning: number, lastReset: number }>({
    error: 0,
    warning: 0,
    lastReset: Date.now()
  });

  const resetState = React.useCallback(() => {
    setIsRendering(false);
    setProgress(0);
    setCurrentFrame(0);
    setTotalFrames(0);
    setStartTime(null);
    setElapsedTime(0);
    setMemoryUsage(0);
    setPeakMemory(0);
    setCurrentSample(0);
    setTotalSamples(0);
    setInCompositing(false);
    setCompositingOperation("");
    setCurrentProcessId(null);
    setCurrentTile(0);
    setTotalTiles(0);
    setRemainingTime("");
    setSamplesDetected(false);
    setIsWarmingUp(false);
    setRenderCompleted(false);

    // Reset rate limiting
    logBufferRef.current = [];
    lastLogFlushRef.current = Date.now();
    toastCountRef.current = { error: 0, warning: 0, lastReset: Date.now() };
  }, []);

  // Flush log buffer periodically
  const flushLogBuffer = React.useCallback(() => {
    if (logBufferRef.current.length > 0) {
      const logsToAdd = logBufferRef.current.slice(0, 50); // Max 50 logs at once
      // Add logs using onAddLog to avoid circular dependency
      logsToAdd.forEach(log => {
        const level = log.toLowerCase().includes('error') ? 'error' :
                     log.toLowerCase().includes('warning') ? 'warning' : 'info';
        onAddLog(log, level as LogLevel);
      });
      logBufferRef.current = logBufferRef.current.slice(50);
    }
    lastLogFlushRef.current = Date.now();
  }, [onAddLog]);

  // Throttled addLog with buffering
  const addLogThrottled = React.useCallback((message: string, level: string = 'info') => {
    // Skip verbose/repetitive logs
    if (message.includes('Remaining:') || message.includes('Sample')) {
      return; // Don't log progress updates
    }

    logBufferRef.current.push(message);

    // Flush buffer every 500ms
    const now = Date.now();
    if (now - lastLogFlushRef.current > 500) {
      flushLogBuffer();
    }
  }, [flushLogBuffer]);

  // Rate-limited toast
  const showToastRateLimited = React.useCallback((type: 'error' | 'warning' | 'success', title: string, description: string) => {
    const now = Date.now();
    const toastLimit = toastCountRef.current;

    // Reset counters every 10 seconds
    if (now - toastLimit.lastReset > 10000) {
      toastLimit.error = 0;
      toastLimit.warning = 0;
      toastLimit.lastReset = now;
    }

    // Limit: max 3 error toasts and 2 warning toasts per 10 seconds
    if (type === 'error' && toastLimit.error >= 3) {
      console.warn('Toast rate limit reached for errors');
      return;
    }
    if (type === 'warning' && toastLimit.warning >= 2) {
      console.warn('Toast rate limit reached for warnings');
      return;
    }

    // Show toast and increment counter
    if (type === 'error') {
      toast.error(title, { description });
      toastLimit.error++;
    } else if (type === 'warning') {
      toast.warning(title, { description });
      toastLimit.warning++;
    } else {
      toast.success(title, { description });
    }
  }, []);

  // Auto-hide render completed overlay after 3 seconds and reset
  useEffect(() => {
    if (renderCompleted) {
      const timer = setTimeout(() => {
        resetState();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [renderCompleted, resetState]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRendering && startTime) {
      timer = setInterval(() => {
        setElapsedTime(
          Math.floor((new Date().getTime() - startTime.getTime()) / 1000)
        );
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRendering, startTime]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  };

  const addLog = (message: string, level: LogLevel = "info") => {
    onAddLog(message, level);
  };

  // Handle external render process ID
  useEffect(() => {
    if (externalProcessId && !isRendering) {
      console.log('External process ID received:', externalProcessId);
      setCurrentProcessId(externalProcessId);
      setIsRendering(true);
      setStartTime(new Date());
      setCurrentTile(0);
      setTotalTiles(0);
      setRemainingTime("");
      setSamplesDetected(false);
      setIsWarmingUp(true); // Start warm-up phase
      setRenderCompleted(false);
      addLog(`External render started: ${externalProcessId}`, 'info');

      // Setup listeners for this external process
      window.electronAPI.removeAllListeners(`progress-${externalProcessId}`);
      window.electronAPI.removeAllListeners(`complete-${externalProcessId}`);
      window.electronAPI.removeAllListeners(`error-${externalProcessId}`);

      window.electronAPI.on(`progress-${externalProcessId}`, (data: string | ProgressEventData) => {
        if (typeof data === "string") {
          // Use throttled logging to prevent UI freeze
          addLogThrottled(data);
        } else if (typeof data === "object" && data !== null) {
          const progressData = data as ProgressEventData;

          // End warm-up when we receive any progress data
          if (progressData.progress !== undefined || progressData.currentSample !== undefined || progressData.currentTile !== undefined) {
            setIsWarmingUp(false);
          }

          if (progressData.progress !== undefined) setProgress(progressData.progress);
          if (progressData.currentFrame !== undefined) setCurrentFrame(progressData.currentFrame);
          if (progressData.totalFrames !== undefined) setTotalFrames(progressData.totalFrames);
          if (progressData.memoryUsage !== undefined) setMemoryUsage(progressData.memoryUsage);
          if (progressData.peakMemory !== undefined) setPeakMemory(progressData.peakMemory);
          if (progressData.currentSample !== undefined) {
            setCurrentSample(progressData.currentSample);
            setSamplesDetected(true);
          }
          if (progressData.totalSamples !== undefined) setTotalSamples(progressData.totalSamples);
          if (progressData.currentTile !== undefined) setCurrentTile(progressData.currentTile);
          if (progressData.totalTiles !== undefined) setTotalTiles(progressData.totalTiles);
          if (progressData.remainingTime !== undefined) setRemainingTime(progressData.remainingTime);
          if (progressData.inCompositing !== undefined) setInCompositing(progressData.inCompositing);
          if (progressData.compositingOperation !== undefined) setCompositingOperation(progressData.compositingOperation);
        }
      });

      window.electronAPI.on(`complete-${externalProcessId}`, (code: number) => {
        window.electronAPI.removeAllListeners(`progress-${externalProcessId}`);
        window.electronAPI.removeAllListeners(`complete-${externalProcessId}`);
        window.electronAPI.removeAllListeners(`error-${externalProcessId}`);

        if (code === 0) {
          // Set progress to 100% and mark as completed
          setProgress(100);
          setRenderCompleted(true);

          addLog("External render completed successfully", "info");
          flushLogBuffer(); // Flush remaining logs
          toast.success("Render Complete", { description: "External render completed successfully." });
        } else {
          setIsRendering(false);
          setStartTime(null);
          setCurrentProcessId(null);
          addLog(`External render failed with code ${code}`, "error");
        }

        if (onExternalProcessHandled) {
          onExternalProcessHandled();
        }
      });

      window.electronAPI.on(`error-${externalProcessId}`, (error: string) => {
        window.electronAPI.removeAllListeners(`progress-${externalProcessId}`);
        window.electronAPI.removeAllListeners(`complete-${externalProcessId}`);
        window.electronAPI.removeAllListeners(`error-${externalProcessId}`);

        setIsRendering(false);
        setStartTime(null);
        setCurrentProcessId(null);
        addLog(`External render error: ${error}`, "error");
        flushLogBuffer(); // Flush remaining logs
        showToastRateLimited("error", "Render Failed", error);

        if (onExternalProcessHandled) {
          onExternalProcessHandled();
        }
      });
    }
  }, [externalProcessId]);

  // Add system monitoring effect
  useEffect(() => {
    // Start system monitoring when component mounts
    window.electronAPI.startSystemMonitor();

    // Listen for system stats
    window.electronAPI.onSystemStats((stats: SystemStats) => {
      setSystemStats(stats);
    });

    // Debug: Log command for parameter extraction
    if (command) {
      console.log(
        "🔍 Command available for parameter extraction:",
        command.substring(0, 100) + "..."
      );
    }

    // Cleanup on unmount
    return () => {
      window.electronAPI.stopSystemMonitor();
    };
  }, []);

  const extractParametersFromCommand = (command: string) => {
    // Estrai il percorso di Blender (prima parte del comando)
    const blenderPath = command.split(" -b")[0].replace(/"/g, "");

    // Estrai la versione di Blender dal percorso
    let blenderVersion = "Unknown";
    if (blenderPath.includes("Blender Foundation")) {
      const versionMatch = blenderPath.match(
        /Blender Foundation[\\/]Blender ([\d.]+)/
      );
      if (versionMatch) {
        blenderVersion = versionMatch[1];
      }
    } else if (blenderPath.includes("Programs")) {
      const versionMatch = blenderPath.match(
        /Programs[\\/]Blender[\\/]([\d.]+)/
      );
      if (versionMatch) {
        blenderVersion = versionMatch[1];
      }
    } else if (blenderPath.includes("blender")) {
      // Prova a estrarre la versione dal nome del file
      const versionMatch = blenderPath.match(/blender[^\\/]*?([\d.]+)/i);
      if (versionMatch) {
        blenderVersion = versionMatch[1];
      }
    }

    // Estrai il file .blend dal comando (dopo -b)
    const blendFileMatch = command.match(/-b\s+"([^"]+)"/);
    let blendFileName = "Render";
    if (blendFileMatch) {
      const filePath = blendFileMatch[1];
      // Prendi solo il nome del file senza percorso ed estensione
      const fileName = filePath.split(/[\\/]/).pop();
      if (fileName) {
        blendFileName = fileName.replace(/\.blend$/i, '');
      }
    }

    // Estrai il percorso di output completo (dopo -o)
    const outputMatch = command.match(/-o\s+"([^"]+)"/);
    let outputPath = "";
    let outputDirectory = "";
    if (outputMatch) {
      outputPath = outputMatch[1];
      // Salva anche la directory
      outputDirectory = outputPath.split(/[\\/]/).slice(0, -1).join("/");
    }

    // Estrai il motore di rendering (dopo -E)
    let renderEngine = "Unknown";
    const engineMatch = command.match(/-E\s+(\w+)/);
    if (engineMatch) {
      const engine = engineMatch[1];
      switch (engine) {
        case "CYCLES":
          renderEngine = "Cycles";
          break;
        case "BLENDER_EEVEE":
          renderEngine = "Eevee";
          break;
        case "BLENDER_WORKBENCH":
          renderEngine = "Workbench";
          break;
        default:
          renderEngine = engine;
      }
    }

    // Estrai i frame dal comando
    let totalFrames = 0;
    let startFrame = 1;

    // Controlla se è un'animazione (con -a)
    if (command.includes(" -a")) {
      const startMatch = command.match(/-s\s+(\d+)/);
      const endMatch = command.match(/-e\s+(\d+)/);
      if (startMatch && endMatch) {
        startFrame = parseInt(startMatch[1]);
        const end = parseInt(endMatch[1]);
        totalFrames = end - startFrame + 1;
      }
    }
    // Controlla se è un frame singolo (con -f)
    else if (command.includes(" -f ")) {
      const frameMatch = command.match(/-f\s+(\d+)/);
      if (frameMatch) {
        startFrame = parseInt(frameMatch[1]);
      }
      totalFrames = 1;
    }

    console.log("📊 Extracted parameters from command:", {
      blendFileName,
      blenderVersion,
      renderEngine,
      outputPath,
      outputDirectory,
      totalFrames,
      command: command.substring(0, 100) + "...",
    });

    return {
      blendFileName,
      blenderVersion,
      renderEngine,
      outputPath,
      outputDirectory,
      totalFrames,
      startFrame,
      lastUsed: new Date().toISOString(),
    };
  };

  const createHistoryItem = async (
    status: "completed" | "failed" | "stopped",
    error?: string,
    renderStartTime?: Date | null
  ): Promise<Omit<HistoryItem, "id">> => {
    const now = new Date();
    const actualStartTime = renderStartTime || now;
    const duration = Math.floor(
      (now.getTime() - actualStartTime.getTime()) / 1000
    );

    // Usa l'estrazione dal comando invece degli handler IPC
    const parameters = extractParametersFromCommand(command);

    // Calcola i frame finali usando i valori rilevati o quelli estratti dal comando
    const finalTotalFrames = totalFrames || parameters.totalFrames;
    const finalCurrentFrame =
      status === "completed" ? finalTotalFrames : currentFrame;

    // Genera nome entry: "NomeFile {N}"
    // Carica history esistente per calcolare il counter
    const existingHistory = await window.electronAPI.loadHistory();
    const sameNameCount = existingHistory.filter(item =>
      item.name.startsWith(parameters.blendFileName + " // ")
    ).length;
    const entryName = `${parameters.blendFileName} // ${sameNameCount + 1}`;

    console.log("📊 History item data:", {
      duration,
      entryName,
      actualStartTime: actualStartTime.toISOString(),
      endTime: now.toISOString(),
      blenderVersion: parameters.blenderVersion,
      renderEngine: parameters.renderEngine,
      outputPath: parameters.outputPath,
      totalFrames: finalTotalFrames,
      currentFrame: finalCurrentFrame,
      status,
    });

    return {
      name: entryName,
      command: command,
      status,
      startTime: actualStartTime.toISOString(),
      endTime: now.toISOString(),
      duration,
      progress: status === "completed" ? 100 : progress,
      currentFrame: finalCurrentFrame,
      totalFrames: finalTotalFrames,
      currentSample: status === "completed" ? totalSamples : currentSample,
      totalSamples: totalSamples,
      error: error,
      parameters: {
        blenderVersion: parameters.blenderVersion,
        renderEngine: parameters.renderEngine,
        outputPath: parameters.outputPath,
        outputDirectory: parameters.outputDirectory,
        totalFrames: finalTotalFrames,
        lastUsed: now.toISOString(),
      },
    };
  };

  const handleStartRender = async () => {
    if (!command) {
      toast.error("Error", {
        description: "No command available to execute.",
      });
      return;
    }

    // Salva il timestamp di inizio in una variabile locale
    const renderStartTime = new Date();
    renderStartTimeRef.current = renderStartTime;

    setIsRendering(true);
    setProgress(0);
    setCurrentFrame(0);
    setTotalFrames(0);
    setStartTime(renderStartTime);
    setMemoryUsage(0);
    setPeakMemory(0);
    setCurrentSample(0);
    setTotalSamples(0);
    setInCompositing(false);
    setCompositingOperation("");
    setCurrentTile(0);
    setTotalTiles(0);
    setRemainingTime("");
    setSamplesDetected(false);
    setIsWarmingUp(true); // Start warm-up phase
    setRenderCompleted(false);

    try {
      const { id } = await window.electronAPI.executeCommand(command);
      setCurrentProcessId(id);
      addLog("Starting render process...", "info");

      // Rimuovi eventuali listener precedenti
      window.electronAPI.removeAllListeners(`progress-${id}`);
      window.electronAPI.removeAllListeners(`complete-${id}`);
      window.electronAPI.removeAllListeners(`error-${id}`);

      // Ascolta gli eventi di progresso
      window.electronAPI.on(
        `progress-${id}`,
        (data: string | ProgressEventData) => {
          if (typeof data === "string") {
            // Use throttled logging to prevent UI freeze
            addLogThrottled(data);
          } else if (typeof data === "object" && data !== null) {
            const progressData = data as ProgressEventData;

            if (
              "progress" in progressData &&
              progressData.progress !== undefined
            ) {
              setProgress(progressData.progress);
            }
            if (
              "currentFrame" in progressData &&
              progressData.currentFrame !== undefined
            ) {
              setCurrentFrame(progressData.currentFrame);
            }
            if (
              "totalFrames" in progressData &&
              progressData.totalFrames !== undefined
            ) {
              setTotalFrames(progressData.totalFrames);
            }
            if (
              "memoryUsage" in progressData &&
              progressData.memoryUsage !== undefined
            ) {
              setMemoryUsage(progressData.memoryUsage);
            }
            if (
              "peakMemory" in progressData &&
              progressData.peakMemory !== undefined
            ) {
              setPeakMemory(progressData.peakMemory);
            }
            // End warm-up when we receive any progress data
            if (progressData.progress !== undefined || progressData.currentSample !== undefined || progressData.currentTile !== undefined) {
              setIsWarmingUp(false);
            }

            if (
              "currentSample" in progressData &&
              progressData.currentSample !== undefined
            ) {
              setCurrentSample(progressData.currentSample);
              setSamplesDetected(true); // Mark that we detected samples
            }
            if (
              "totalSamples" in progressData &&
              progressData.totalSamples !== undefined
            ) {
              setTotalSamples(progressData.totalSamples);
            }
            if (
              "currentTile" in progressData &&
              progressData.currentTile !== undefined
            ) {
              setCurrentTile(progressData.currentTile);
            }
            if (
              "totalTiles" in progressData &&
              progressData.totalTiles !== undefined
            ) {
              setTotalTiles(progressData.totalTiles);
            }
            if (
              "remainingTime" in progressData &&
              progressData.remainingTime !== undefined
            ) {
              setRemainingTime(progressData.remainingTime);
            }
            if (
              "inCompositing" in progressData &&
              progressData.inCompositing !== undefined
            ) {
              setInCompositing(progressData.inCompositing);
            }
            if (
              "compositingOperation" in progressData &&
              progressData.compositingOperation !== undefined
            ) {
              setCompositingOperation(progressData.compositingOperation);
            }
          }
        }
      );

      // Ascolta l'evento di completamento
      window.electronAPI.on(`complete-${id}`, async (code: number) => {
        // Pulisce i listener una volta completato
        window.electronAPI.removeAllListeners(`progress-${id}`);
        window.electronAPI.removeAllListeners(`complete-${id}`);
        window.electronAPI.removeAllListeners(`error-${id}`);

        if (code === 0) {
          // Set progress to 100% and mark as completed
          setProgress(100);
          setRenderCompleted(true);

          addLog("Render completed successfully", "info");
          flushLogBuffer(); // Flush remaining logs
          toast.success("Render Complete", {
            description: "The render has completed successfully.",
          });

          // Aggiungi alla cronologia - usa la variabile locale renderStartTime
          const historyItem = await createHistoryItem(
            "completed",
            undefined,
            renderStartTime
          );
          addHistoryItem(historyItem);
        } else {
          addLog(`Render failed with code ${code}`, "error");
          flushLogBuffer(); // Flush remaining logs
          showToastRateLimited("error", "Render Failed", `The render failed with code ${code}.`);

          // Aggiungi alla cronologia come fallito - usa la variabile locale renderStartTime
          const historyItem = await createHistoryItem(
            "failed",
            `Render failed with code ${code}`,
            renderStartTime
          );
          addHistoryItem(historyItem);
        }
      });

      // Ascolta gli eventi di errore
      window.electronAPI.on(`error-${id}`, async (error: string) => {
        // Non fermare il rendering se l'errore non è critico
        if (error.includes("Failed to start the render process")) {
          // Pulisce i listener in caso di errore critico
          window.electronAPI.removeAllListeners(`progress-${id}`);
          window.electronAPI.removeAllListeners(`complete-${id}`);
          window.electronAPI.removeAllListeners(`error-${id}`);

          setIsRendering(false);
          setStartTime(null);
          addLog(error, "error");
          flushLogBuffer(); // Flush remaining logs
          showToastRateLimited("error", "Render Error", error);

          // Aggiungi alla cronologia come fallito - usa la variabile locale renderStartTime
          const historyItem = await createHistoryItem(
            "failed",
            error,
            renderStartTime
          );
          addHistoryItem(historyItem);
        } else {
          addLog(error, "warning");
        }
      });
    } catch (error) {
      console.error("Error starting render:", error);
      setIsRendering(false);
      setStartTime(null);
      addLog("Failed to start the render process", "fatal");
      toast.error("Error", {
        description: "Failed to start the render process.",
      });

      // Aggiungi alla cronologia come fallito - usa la variabile locale renderStartTime
      const historyItem = await createHistoryItem(
        "failed",
        "Failed to start the render process",
        renderStartTime
      );
      addHistoryItem(historyItem);
    }
  };

  const handleStopRender = async () => {
    if (currentProcessId) {
      try {
        await window.electronAPI.stopProcess(currentProcessId);

        // Pulisce i listener quando il render viene fermato
        window.electronAPI.removeAllListeners(`progress-${currentProcessId}`);
        window.electronAPI.removeAllListeners(`complete-${currentProcessId}`);
        window.electronAPI.removeAllListeners(`error-${currentProcessId}`);

        // Usa il renderStartTime dal ref
        const renderStartTime = renderStartTimeRef.current;
        setIsRendering(false);
        setStartTime(null);
        addLog("Render stopped by user", "warning");
        toast.info("Render Stopped", {
          description: "The render has been stopped.",
        });

        // Aggiungi alla cronologia come interrotto
        const historyItem = await createHistoryItem(
          "stopped",
          undefined,
          renderStartTime
        );
        addHistoryItem(historyItem);
      } catch (error) {
        console.error("Error stopping render:", error);
        addLog("Failed to stop the render process", "error");
        toast.error("Error", {
          description: "Failed to stop the render process.",
        });
      }
    }
  };

  const handleAddToQueue = () => {
    if (!command) {
      toast.error("Error", {
        description: "No command available to add to queue.",
      });
      return;
    }

    if (!queueName.trim()) {
      toast.error("Error", {
        description: "Please enter a name for the queue item.",
      });
      return;
    }

    addItem({
      name: queueName,
      command,
      priority: 1,
      parameters: {
        blenderVersion: "3.0.0",
        renderEngine: "cycles",
        lastUsed: new Date().toISOString(),
      },
    });

    setQueueName("");
    toast.success("Added to Queue", {
      description: "The render has been added to the queue.",
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-none">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Frame className="h-5 w-5" />
                Render Controls
              </CardTitle>
              <Button
                onClick={onToggleLogPanel}
                variant={
                  logs.filter(
                    (log) => log.level === "error" || log.level === "fatal"
                  ).length > 0
                    ? "destructive"
                    : logs.filter((log) => log.level === "warning").length > 0
                    ? "secondary"
                    : "outline"
                }
                size="sm"
                className="flex items-center gap-2"
              >
                <div className="flex items-center gap-2">
                  {logs.filter(
                    (log) => log.level === "error" || log.level === "fatal"
                  ).length > 0 ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : logs.filter((log) => log.level === "warning").length >
                    0 ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : (
                    <Terminal className="h-4 w-4" />
                  )}
                  <span className="text-sm">
                    {logs.filter(
                      (log) => log.level === "error" || log.level === "fatal"
                    ).length > 0
                      ? "Errors"
                      : logs.filter((log) => log.level === "warning").length > 0
                      ? "Warnings"
                      : "Logs"}
                  </span>
                </div>

                {logs.length > 0 && (
                  <div className="flex items-center gap-1">
                    {logs.filter(
                      (log) => log.level === "error" || log.level === "fatal"
                    ).length > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-xs bg-red-500/20 text-red-400"
                      >
                        {
                          logs.filter(
                            (log) =>
                              log.level === "error" || log.level === "fatal"
                          ).length
                        }
                      </Badge>
                    )}
                    {logs.filter((log) => log.level === "warning").length >
                      0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-xs bg-yellow-500/20 text-yellow-400"
                      >
                        {logs.filter((log) => log.level === "warning").length}
                      </Badge>
                    )}
                    {logs.filter(
                      (log) => log.level === "error" || log.level === "fatal"
                    ).length === 0 &&
                      logs.filter((log) => log.level === "warning").length ===
                        0 && (
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-xs"
                        >
                          {logs.length}
                        </Badge>
                      )}
                  </div>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button
                    onClick={handleStartRender}
                    disabled={isRendering || !command}
                    variant={"shadow"}
                    color={"success"}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </Button>
                  <Button
                    onClick={handleStopRender}
                    variant={"outline"}
                    color={"destructive"}
                    disabled={!isRendering}
                  >
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                  <Button
                    onClick={resetState}
                    disabled={isRendering}
                    variant="ghost"
                    color="warning"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset
                  </Button>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="ghost" color="primary">
                        <Plus className="h-4 w-4 mr-2" />
                        Add to Queue
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add to Queue</DialogTitle>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="name">Queue Item Name</Label>
                          <Input
                            id="name"
                            value={queueName}
                            onChange={(e) => setQueueName(e.target.value)}
                            placeholder="Enter a name for this render"
                          />
                        </div>
                        <Button onClick={handleAddToQueue}>Add to Queue</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
                <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" className="relative">
                      <History className="h-4 w-4 mr-2" />
                      History
                      {items.length > 0 && (
                        <Badge
                          variant="secondary"
                          className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                        >
                          {items.length}
                        </Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                      <SheetTitle>Render History</SheetTitle>
                    </SheetHeader>
                    <HistoryPanel />
                  </SheetContent>
                </Sheet>
              </div>

              <div className="relative">
                {/* Waiting to Start Overlay */}
                {!isRendering && !renderCompleted && (
                  <div className="absolute inset-0 z-50 backdrop-blur-sm bg-background/40 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold bg-gradient-to-r from-gray-400 via-gray-500 to-gray-600 bg-clip-text text-transparent">
                        Waiting to start...
                      </div>
                    </div>
                  </div>
                )}

                {/* Warm-up Overlay */}
                {isWarmingUp && (
                  <div className="absolute inset-0 z-50 backdrop-blur-md bg-background/50 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent animate-pulse">
                        Warming up scene...
                      </div>
                    </div>
                  </div>
                )}

                {/* Render Completed Overlay */}
                {renderCompleted && (
                  <div className="absolute inset-0 z-50 backdrop-blur-sm bg-background/40 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-3xl font-bold bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 bg-clip-text text-transparent">
                        Render Completed
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center gap-4 mb-4">
                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Timer className="h-4 w-4" />
                      Elapsed Time
                    </span>
                    <span className="text-base font-medium">
                      {formatTime(elapsedTime)}
                    </span>
                  </div>

                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Frame className="h-4 w-4" />
                      Frame Progress
                    </span>
                    <span className="text-base font-medium">
                      {currentFrame}/{totalFrames}
                    </span>
                  </div>

                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Progress
                    </span>
                    <span className="text-base font-medium">
                      {progress.toFixed(1)}%
                    </span>
                  </div>
                </div>
                {/* Samples Progress - Only show if detected and not completed */}
                {!renderCompleted && samplesDetected && totalSamples > 0 && (
                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full mb-4">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Samples
                    </span>
                    <span className="text-base font-medium">
                      {currentSample}/{totalSamples}
                    </span>
                    <Progress
                      value={(currentSample / totalSamples) * 100}
                      className="h-2"
                      variant="success"
                    />
                  </div>
                )}

                {/* Tiles Progress - Blender 5.x */}
                {totalTiles > 0 && (
                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full mb-4">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Tiles
                    </span>
                    <span className="text-base font-medium">
                      {currentTile}/{totalTiles}
                    </span>
                    <Progress
                      value={(currentTile / totalTiles) * 100}
                      className="h-2"
                      variant="success"
                    />
                  </div>
                )}

                {/* Remaining Time - Blender 5.x - Only show if not completed */}
                {!renderCompleted && remainingTime && (
                  <div className="flex flex-col bg-neutral-950 p-2 rounded-md gap-2 w-full mb-4">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Remaining
                    </span>
                    <span className="text-base font-medium">
                      {remainingTime}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Frame className="h-4 w-4" />
                    Progress
                  </span>
                  <span className="text-sm font-medium">
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {inCompositing && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground flex items-center gap-2">
                      <Layers className="h-4 w-4" />
                      Compositing
                    </span>
                    <span className="text-sm font-medium">
                      {compositingOperation}
                    </span>
                  </div>
                  <Progress value={100} className="h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-y-auto mt-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              System Info
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-background rounded-md p-4">
                  <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Current Memory Usage
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Current: {Math.round(memoryUsage)} MB</span>
                      <span>{systemStats?.memory.percentage || "0%"}</span>
                    </div>
                    <Progress
                      value={
                        systemStats
                          ? parseFloat(systemStats.memory.percentage)
                          : 0
                      }
                      className="h-2"
                    />
                  </div>
                </div>
                <div className="bg-background rounded-md p-4">
                  <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    Peak Memory Usage
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Peak: {Math.round(peakMemory)} MB</span>
                      <span>
                        {systemStats?.memory.used || "0 GB"} /{" "}
                        {systemStats?.memory.total || "0 GB"}
                      </span>
                    </div>
                    <Progress
                      value={
                        peakMemory > 0
                          ? Math.min((peakMemory / 8192) * 100, 100)
                          : 0
                      }
                      className="h-2"
                      variant="secondary"
                    />
                  </div>
                </div>
              </div>

              {/* System Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-background rounded-md p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Cpu className="h-4 w-4" />
                    CPU Information
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Usage:</span>
                      <span>{systemStats?.cpu.usage || "0%"}</span>
                    </div>
                    <Progress
                      value={
                        systemStats ? parseFloat(systemStats.cpu.usage) : 0
                      }
                      className="h-2"
                      variant="success"
                    />
                    <div className="text-xs text-muted-foreground mt-2">
                      {systemStats?.cpu.cores.length || 0} cores available
                    </div>
                  </div>
                </div>

                <div className="bg-background rounded-md p-4">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    System Memory
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Used:</span>
                      <span>
                        {systemStats?.memory.used || "0 GB"} /{" "}
                        {systemStats?.memory.total || "0 GB"}
                      </span>
                    </div>
                    <Progress
                      value={
                        systemStats
                          ? parseFloat(systemStats.memory.percentage)
                          : 0
                      }
                      className="h-2"
                      variant="warning"
                    />
                    <div className="text-xs text-muted-foreground">
                      {systemStats?.memory.percentage || "0%"} utilization
                    </div>
                  </div>
                </div>
              </div>

              {/* GPU Information */}
              {systemStats?.gpu && systemStats.gpu.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    GPU Information ({systemStats.gpu.length} discrete GPU
                    {systemStats.gpu.length !== 1 ? "s" : ""})
                  </h3>
                  <div className="space-y-4">
                    {systemStats.gpu.map((gpu, index) => (
                      <div
                        key={index}
                        className="bg-background rounded-md p-4 space-y-4"
                      >
                        <div
                          className="font-medium text-sm truncate"
                          title={gpu.name}
                        >
                          {gpu.name}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span>GPU Usage:</span>
                              <span>{gpu.usage}</span>
                            </div>
                            <Progress
                              value={parseFloat(gpu.usage)}
                              className="h-2"
                              variant="success"
                            />
                          </div>

                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span>VRAM:</span>
                              <span>
                                {gpu.memory.used} / {gpu.memory.total}
                              </span>
                            </div>
                            <Progress
                              value={parseFloat(gpu.memory.percentage)}
                              className="h-2"
                              variant="warning"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <Thermometer className="h-3 w-3" />
                            <span>{gpu.temperature}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Zap className="h-3 w-3" />
                            <span>{gpu.power}</span>
                          </div>
                          {gpu.coreClock && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span title="Core Clock">{gpu.coreClock}</span>
                            </div>
                          )}
                          {gpu.memoryClock && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-blue-400" />
                              <span title="Memory Clock">
                                {gpu.memoryClock}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default RenderPanel;
