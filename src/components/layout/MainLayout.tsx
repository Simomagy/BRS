"use client";

import React, { useState, useEffect } from "react";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import PresetPanel from "./PresetPanel";
import SettingsPanel from "./SettingsPanel";
import RenderPanel from "./RenderPanel";
import CommandPreviewDrawer from "./CommandPreviewDrawer";
import CommandPreviewBar from "./CommandPreviewBar";

import { QueueSheet } from "./QueueSheet";
import { Button } from "@/components/ui/button";
import { Terminal, User, Smartphone, Image as ImageIcon } from "lucide-react";
import BlenderPathSelector from "./BlenderPathSelector";
import { Preset } from "@/types/preset";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import LoadingScreen from "@/components/layout/loading-screen";
import { Skeleton } from "../ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import QueuePanel from "./QueuePanel";
import OnboardingWizard from "@/components/onboarding/OnboardingWizard";
import { useOnboardingStore } from "@/store/onboardingStore";
import { generateUniqueFilename } from "@/lib/fileUtils";
import { CloseWarningDialog } from "./CloseWarningDialog";
import LogPanel from "./LogPanel";
import { LogEntry, LogLevel } from "./LogViewer";
import { useLogBuffer } from "@/hooks/useLogBuffer";
import MobileCompanionPanel from "../MobileCompanionPanel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const MainLayout: React.FC = () => {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isCommandPreviewOpen, setIsCommandPreviewOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<Preset | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(
    "Initializing application..."
  );
  const [command, setCommand] = useState("");
  const [progress, setProgress] = useState(0);
  const { logs, addLog, clearLogs } = useLogBuffer();
  const [isLogPanelVisible, setIsLogPanelVisible] = useState(false);
  const [isMobileCompanionOpen, setIsMobileCompanionOpen] = useState(false);
  const [externalProcessId, setExternalProcessId] = useState<string | null>(null);

  // Onboarding store hook
  const { showWizard, checkOnboardingStatus } = useOnboardingStore();

  // Listen for external render started events (e.g., from Blender addon)
  useEffect(() => {
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('external-render-started', async (data: any) => {
        console.log('External render started:', data);
        toast.success("Render Started", {
          description: `A render was started from ${data.startedBy || 'external source'}`,
        });

        // Set the external process ID so RenderPanel can start listening
        if (data.processId) {
          setExternalProcessId(data.processId);
          addLog({ timestamp: new Date().toISOString(), level: 'info', message: `External render started: ${data.processId}` });
        }
      });

      // Also listen for generic render-started events
      window.electronAPI.on('render-started', (data: any) => {
        console.log('Render started (generic event):', data);
      });
    }

    return () => {
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('external-render-started');
        window.electronAPI.removeAllListeners('render-started');
      }
    };
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setLoadingMessage("Loading presets...");
        const presets = await window.electronAPI.getAllPresets();
        const lastPreset = presets.find((p) => p.isLast);

        if (lastPreset) {
          setSelectedPreset(lastPreset);
          setSettings(lastPreset.parameters);
        }
        // Primo messaggio dopo 200ms
        setTimeout(() => {
          setProgress(50);
        }, 200);

        // Secondo messaggio dopo 500ms
        setTimeout(() => {
          setLoadingMessage("Detecting Blender...");
          setProgress(70);
        }, 500);

        // Terzo messaggio dopo 1000ms
        setTimeout(() => {
          setLoadingMessage("Loading Completed. Welcome to BRS");
          setProgress(100);
        }, 1000);

        // Aspetta un momento per mostrare il messaggio di loading finale
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Controlla se è necessario mostrare l'onboarding
        checkOnboardingStatusAndShow();
      } catch (error) {
        console.error("Error initializing app:", error);
        toast.error("Error", {
          description: "Failed to initialize application",
        });
      } finally {
        setTimeout(() => {
          setIsLoading(false);
          setProgress(0);
        }, 500);
      }
    };

    initializeApp();
  }, []);

  // Funzione per controllare lo stato dell'onboarding
  const checkOnboardingStatusAndShow = () => {
    try {
      const isCompleted = checkOnboardingStatus();

      if (!isCompleted) {
        // Se l'onboarding non è mai stato completato, mostra il wizard completo
        setTimeout(() => {
          showWizard("welcome");
        }, 1000); // Aspetta un momento dopo il caricamento
      }
      // Se l'onboarding è già stato completato, non mostrare più nulla
      // L'utente può sempre configurare Blender tramite il selector nell'interfaccia
    } catch (error) {
      console.error("Error checking onboarding status:", error);
      // In caso di errore, mostra l'onboarding per sicurezza (primo avvio)
      setTimeout(() => {
        showWizard("welcome");
      }, 1000);
    }
  };

  const generateCommand = async (settings: Record<string, any>) => {
    if (!settings.blender_path) return "";

    let command = `"${settings.blender_path}" -b`;

    // Base Settings
    if (settings.blend_file) {
      command += ` "${settings.blend_file}"`;
    }

    // Render Settings
    if (settings.render_enabled) {
      // Engine
      if (settings.render_engine) {
        command += ` -E ${settings.render_engine}`;
      }

      // Scene
      if (settings.scene) {
        command += ` -S "${settings.scene}"`;
      }
    }

    // Output Settings
    if (settings.output_enabled) {
      // Output format (must be between -E and -o)
      if (settings.output_format) {
        command += ` -F ${settings.output_format.toUpperCase()}`;
      }

      // Output path and filename with unique naming
      const outputPath = settings.output_path || "";
      const fileName = settings.output_filename || "render";
      const baseOutputPath = `${outputPath}/${fileName}`;

      // Generate unique filename to avoid overwriting existing files
      const uniqueOutputPath = await generateUniqueFilename(
        baseOutputPath,
        settings.output_format
      );
      command += ` -o "${uniqueOutputPath}"`;
    }

    // Resolution Settings
    // NOTE: Blender reads resolution from .blend file
    // There are no direct CLI parameters for resolution X/Y
    // Resolution must be set in the .blend file itself

    // Optional: Use Python script for runtime resolution override
    if (settings.resolution_enabled && (settings.resolution_x || settings.resolution_y || settings.resolution_percentage)) {
      // For now, resolution comes from .blend file
      // TODO: Implement Python script injection for resolution override
    }

    // Frame Settings
    if (settings.frames_enabled) {
      // Se è attiva l'animazione, usa -a e i parametri di frame
      if (settings.render_animation) {
        command += ` -s ${settings.frame_start || 1}`;
        command += ` -e ${settings.frame_end || 1}`;
        if (settings.frame_jump && settings.frame_jump > 1) {
          command += ` -j ${settings.frame_jump}`;
        }
        command += ` -a`; // -a deve essere sempre l'ultimo
      }
      // Altrimenti, se è attivo il frame singolo, usa -f
      else if (
        settings.single_frame !== undefined &&
        settings.single_frame !== null
      ) {
        command += ` -f ${settings.single_frame}`;
      }
      // Se non è né animazione né frame singolo, usa i parametri di frame
      else {
        command += ` -s ${settings.frame_start || 1}`;
        command += ` -e ${settings.frame_end || 1}`;
        if (settings.frame_jump && settings.frame_jump > 1) {
          command += ` -j ${settings.frame_jump}`;
        }
      }
    }

    // Cycles Settings
    if (settings.cycles_enabled) {
      if (settings.cycles_samples) {
        command += ` --cycles-samples ${settings.cycles_samples}`;
      }
      if (settings.threads) {
        command += ` --threads ${settings.threads}`;
      }
    }

    return command;
  };

  useEffect(() => {
    const updateCommand = async () => {
      const cmd = await generateCommand(settings);
      setCommand(cmd);
    };
    updateCommand();
  }, [settings]);

  const handleSettingsChange = async (newSettings: Record<string, any>) => {
    setSettings((prevSettings) => {
      const updatedSettings = {
        ...prevSettings,
        ...newSettings,
      };
      // Update command asynchronously
      generateCommand(updatedSettings).then(setCommand);
      return updatedSettings;
    });
  };

  const handlePresetSelect = async (preset: Preset | null) => {
    setSelectedPreset(preset);
    if (preset) {
      const newSettings = preset.parameters;
      setSettings(newSettings);
      const cmd = await generateCommand(newSettings);
      setCommand(cmd);
    } else {
      setSettings({});
      setCommand("");
    }
  };

  const handleAddLog = (message: string, level: LogLevel = "info") => {
    const timestamp = new Date().toLocaleTimeString();
    addLog({ timestamp, level, message });
  };

  const handleClearLogs = () => {
    clearLogs();
    toast.success("Logs cleared");
  };

  const handleToggleLogPanel = () => {
    setIsLogPanelVisible(!isLogPanelVisible);
  };

  const handleResetCommand = () => {
    setSettings({});
    setSelectedPreset(null);
    setCommand("");
    clearLogs();
    toast.success("Command reset", {
      description: "Settings have been reset to default values.",
    });
  };

  const handlePresetLoad = async (preset: Preset) => {
    const newSettings = preset.parameters;
    setSettings(newSettings);
    setSelectedPreset(preset);
    const cmd = await generateCommand(newSettings);
    setCommand(cmd);
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {isLoading ? (
        <div className="flex h-screen flex-col overflow-hidden bg-background">
          <LoadingScreen message={loadingMessage} progress={progress} />
          {/* Top Bar Skeleton */}
          <div className="flex items-center justify-between border-b bg-card/95 backdrop-blur-sm px-4 py-2">
            <Skeleton className="h-8 w-48" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-10 w-[300px]" />
              <Skeleton className="h-10 w-10" />
              <Skeleton className="h-10 w-10" />
            </div>
          </div>

          {/* Main Content Skeleton */}
          <div className="flex-1 overflow-hidden p-2">
            <div className="flex h-full gap-2">
              <Skeleton className="flex-1" />
              <Skeleton className="w-2" />
              <Skeleton className="flex-1" />
            </div>
          </div>

          {/* Bottom Bar Skeleton */}
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b bg-card/95 backdrop-blur-sm px-4 py-2">
            <div className="flex items-center gap-2">
              <Avatar>
                <AvatarImage src="/logo.png" alt="BRS Logo" />
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <h2 className="text-lg font-semibold">BRS</h2>
              <p className="text-sm text-muted-foreground">By Nebula Studios</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-2 bg-neutral-950 p-2 rounded-md border border-neutral-800">
                <span className="text-xs text-muted-foreground">
                  Blender Selector
                </span>
                <BlenderPathSelector
                  value={settings.blender_path}
                  onChange={(path) =>
                    handleSettingsChange({ ...settings, blender_path: path })
                  }
                />
              </div>

              <div className="flex flex-col gap-2 bg-neutral-950 p-2 rounded-md border border-neutral-800">
                <span className="text-xs text-muted-foreground">
                  Preset Selector
                </span>
                <PresetPanel
                  currentSettings={settings}
                  onSettingsChange={handleSettingsChange}
                  selectedPreset={selectedPreset}
                  onPresetSelect={handlePresetSelect}
                />
              </div>
              <div className="flex flex-col gap-2 bg-neutral-950 p-2 rounded-md border border-neutral-800">
                <span className="text-xs text-muted-foreground">Queue</span>
                <QueueSheet />
              </div>
              <div className="flex flex-col gap-2 bg-neutral-950 p-2 rounded-md border border-neutral-800">
                <span className="text-xs text-muted-foreground">
                  Render Output
                </span>
                <Button
                  variant={"ghost"}
                  title="View Render Output"
                  onClick={async () => {
                    if (window.electronAPI) {
                      await window.electronAPI.openRenderOutputWindow();
                    }
                  }}
                >
                  <ImageIcon className="h-4 w-4" />
                  <span className="text-xs text-muted-foreground">
                    Render Output
                  </span>
                </Button>
              </div>
              <div className="flex flex-col gap-2 bg-neutral-950 p-2 rounded-md border border-neutral-800">
                <span className="text-xs text-muted-foreground">
                  Mobile/Blender Companion
                </span>
                <Dialog
                  open={isMobileCompanionOpen}
                  onOpenChange={setIsMobileCompanionOpen}
                >
                  <DialogTrigger asChild>
                    <Button variant={"ghost"} title="Mobile/Blender Companion Server">
                      <Smartphone className="h-4 w-4" />
                      <span className="text-xs text-muted-foreground">
                        Server Settings
                      </span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Mobile/Blender Companion Server</DialogTitle>
                    </DialogHeader>
                    <MobileCompanionPanel />
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-hidden p-2">
            <PanelGroup direction="vertical">
              <Panel defaultSize={isLogPanelVisible ? 70 : 100} minSize={50}>
                <PanelGroup direction="horizontal">
                  <Panel defaultSize={50} minSize={30}>
                    <div className="h-full">
                      <SettingsPanel
                        currentSettings={settings}
                        onSettingsChange={handleSettingsChange}
                      />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="w-2 m-2 rounded bg-border hover:bg-primary transition-colors" />
                  <Panel defaultSize={50} minSize={30}>
                    <RenderPanel
                      command={command}
                      logs={logs}
                      onAddLog={handleAddLog}
                      externalProcessId={externalProcessId}
                      onExternalProcessHandled={() => setExternalProcessId(null)}
                      onToggleLogPanel={handleToggleLogPanel}
                      isLogPanelVisible={isLogPanelVisible}
                    />
                  </Panel>
                </PanelGroup>
              </Panel>

              {/* Log Panel - Resizable */}
              {isLogPanelVisible && (
                <>
                  <PanelResizeHandle className="h-2 mt-2 mb-2 rounded bg-border hover:bg-primary transition-colors" />
                  <Panel defaultSize={50} minSize={15} maxSize={60}>
                    <LogPanel
                      logs={logs}
                      isVisible={isLogPanelVisible}
                      onToggle={handleToggleLogPanel}
                      onClear={handleClearLogs}
                      className="h-full"
                    />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </div>

          {/* Command Preview Bar */}
          <div className="border-t bg-background/95 backdrop-blur-sm">
            <CommandPreviewBar
              command={command}
              onOpenDrawer={() => setIsCommandPreviewOpen(true)}
            />
          </div>

          {/* Command Preview Drawer */}
          <CommandPreviewDrawer
            command={command}
            onReset={handleResetCommand}
            open={isCommandPreviewOpen}
            onOpenChange={setIsCommandPreviewOpen}
          />

          {/* Onboarding Wizard */}
          <OnboardingWizard
            blenderPath={settings.blender_path}
            onBlenderPathChange={(path) =>
              handleSettingsChange({ blender_path: path })
            }
          />

          {/* Close Warning Dialog */}
          <CloseWarningDialog />

          {/* Sonner Toaster */}
          <Toaster />
        </>
      )}
    </div>
  );
};

export default MainLayout;
