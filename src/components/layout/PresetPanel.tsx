import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Plus, Save, ChevronDown, Trash, Download, Upload, MoreVertical, Check } from 'lucide-react';
import { presetManager } from '@/lib/presetManager';
import { Preset } from '@/types/preset';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PresetPanelProps {
  currentSettings: Record<string, any>;
  onSettingsChange: (settings: Record<string, any>) => void;
  selectedPreset: Preset | null;
  onPresetSelect: (preset: Preset | null) => void;
}

const PresetPanel: React.FC<PresetPanelProps> = ({
  currentSettings,
  onSettingsChange,
  selectedPreset,
  onPresetSelect
}) => {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  useEffect(() => {
    const init = async () => {
      await loadPresets();
    };
    init();

    // Listen for external preset updates (e.g., from Blender addon)
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on('preset-updated', async (data: any) => {
        console.log('Preset updated via external API:', data);
        await loadPresets(); // Refresh preset list
        toast.info("Preset updated", {
          description: `Preset "${data.preset.name}" was ${data.isNew ? 'created' : 'updated'} via external API.`,
        });
      });

      window.electronAPI.on('preset-deleted', async (data: any) => {
        console.log('Preset deleted via external API:', data);
        await loadPresets(); // Refresh preset list
        if (selectedPreset?.id === data.presetId) {
          onPresetSelect(null); // Deselect if currently selected
        }
        toast.info("Preset deleted", {
          description: "A preset was deleted via external API.",
        });
      });
    }

    // Cleanup listeners on unmount
    return () => {
      if (window.electronAPI && window.electronAPI.removeAllListeners) {
        window.electronAPI.removeAllListeners('preset-updated');
        window.electronAPI.removeAllListeners('preset-deleted');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    presetManager.setCurrentSettings(currentSettings);
  }, [currentSettings]);

  useEffect(() => {
    if (selectedPreset) {
      const currentSettingsStr = JSON.stringify(currentSettings);
      const presetSettingsStr = JSON.stringify(selectedPreset.parameters);
      const hasChanges = currentSettingsStr !== presetSettingsStr;
      console.log('Checking for changes:', {
        current: currentSettingsStr,
        preset: presetSettingsStr,
        hasChanges
      });
      setHasUnsavedChanges(hasChanges);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [currentSettings, selectedPreset]);

  const handleCreatePreset = async () => {
    if (!newPresetName.trim()) {
      setError('Name is required');
      return;
    }

    // Rimuovi il flag isLast da tutti i preset esistenti
    const existingPresets = await window.electronAPI.getAllPresets();
    for (const preset of existingPresets) {
      await window.electronAPI.savePreset({
        ...preset,
        isLast: false
      });
    }

    // Crea il nuovo preset con isLast: true
    const preset = await presetManager.createPreset(newPresetName, {
      isLast: true
    });
    setPresets(prev => [...prev, preset]);
    setNewPresetName('');
    setIsCreateDialogOpen(false);
    setError(null);
    onPresetSelect(preset);

    toast.success("Preset created", {
      description: "Your preset has been created successfully.",
    });
  };

  const handleDeletePreset = async (id: string) => {
    if (await presetManager.deletePreset(id)) {
      setPresets(prev => prev.filter(p => p.id !== id));
      if (selectedPreset?.id === id) {
        onPresetSelect(null);
      }

      toast.success("Preset deleted", {
        description: "The preset has been deleted successfully.",
      });
    }
  };

  const handleExportPreset = async (id: string) => {
    const result = await presetManager.exportPreset(id);
    if (result.success && result.data) {
      const blob = new Blob([result.data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preset-${id}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleImportPreset = async () => {
    try {
      console.log('Starting import process...');

      // Verifica che window.electronAPI sia disponibile
      if (!window.electronAPI) {
        console.error('electronAPI not available');
        toast.error("Import failed", {
          description: "Application error: electronAPI not available",
        });
        return;
      }

      console.log('Opening file dialog...');
      const result = await window.electronAPI.openFileDialog({
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
      });
      console.log('File dialog result:', result);

      if (result && result.length > 0) {
        console.log('Selected file:', result[0]);
        try {
          console.log('Starting import...');
          const importResult = await window.electronAPI.importPresets(result[0]);
          console.log('Import result:', importResult);

          if (importResult.success) {
            loadPresets();
            toast.success("Preset imported", {
              description: "The preset has been imported successfully.",
            });
          } else {
            toast.error("Import failed", {
              description: importResult.message || 'Failed to import preset',
            });
          }
        } catch (importError) {
          console.error('Error during import:', importError);
          toast.error("Import failed", {
            description: "Error during import process",
          });
        }
      } else {
        console.log('No file selected or dialog cancelled');
      }
    } catch (error) {
      console.error('Import error:', error);
      toast.error("Import failed", {
        description: "Error importing preset",
      });
    }
  };

  const handleSelectPreset = async (preset: Preset) => {
    // Rimuovi il flag isLast da tutti i preset esistenti
    const existingPresets = await window.electronAPI.getAllPresets();
    for (const p of existingPresets) {
      await window.electronAPI.savePreset({
        ...p,
        isLast: false
      });
    }

    // Imposta il preset selezionato come ultimo usato
    await window.electronAPI.savePreset({
      ...preset,
      isLast: true
    });

    if (await presetManager.applyPreset(preset.id)) {
      onPresetSelect(preset);
      toast.success("Preset applied", {
        description: "The preset has been applied successfully.",
      });
    }
  };

  const handleSaveCurrent = async () => {
    if (!selectedPreset) {
      toast.error("No preset selected", {
        description: "Please select a preset to save current settings.",
      });
      return;
    }

    const updatedPreset = await presetManager.updatePreset(selectedPreset.id, {
      parameters: currentSettings,
    });

    if (updatedPreset) {
      setPresets(prev => prev.map(p => p.id === updatedPreset.id ? updatedPreset : p));
      onPresetSelect(updatedPreset);
      setHasUnsavedChanges(false);
      toast.success("Settings saved", {
        description: "Current settings have been saved to the preset.",
      });
    }
  };

  const loadPresets = async () => {
    try {
      const loadedPresets = await presetManager.getAllPresets();
      console.log('Loaded presets:', loadedPresets);
      setPresets(loadedPresets);
    } catch (error) {
      console.error('Error loading presets:', error);
      toast.error("Error loading presets", {
        description: "Failed to load presets",
      });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" color='default' className="w-[200px] justify-between">
            {selectedPreset ? selectedPreset.name : "Select Preset"}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[200px]">
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.id}
              onClick={() => handleSelectPreset(preset)}
              className={cn(
                "flex items-center justify-between",
                selectedPreset?.id === preset.id && "bg-accent text-accent-foreground"
              )}
            >
              <div className="flex items-center gap-2">
                {selectedPreset?.id === preset.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
                <span className="truncate">{preset.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {format(new Date(preset.updatedAt), 'PP')}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Plus className="mr-2 h-4 w-4" />
                New Preset
              </DropdownMenuItem>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Preset</DialogTitle>
                <DialogDescription>
                  Create a new preset with your current settings.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter preset name"
                  />
                  {error && <p className="text-sm text-red-500">{error}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleCreatePreset}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <DropdownMenuItem onClick={handleImportPreset}>
            <Upload className="mr-2 h-4 w-4" />
            Import Preset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant={hasUnsavedChanges ? "shadow" : "ghost"}
        color={hasUnsavedChanges ? "success" : "default"}
        size={hasUnsavedChanges ? "sm" : "icon"}
        onClick={handleSaveCurrent}
        disabled={!selectedPreset}
        className="transition-colors duration-200"
      >
        <Save className="h-4 w-4" />
        {hasUnsavedChanges && <span className="text-xs">Save</span>}
      </Button>

      {selectedPreset && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => handleDeletePreset(selectedPreset.id)}>
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExportPreset(selectedPreset.id)}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default PresetPanel;
