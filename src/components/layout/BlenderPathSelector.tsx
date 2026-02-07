import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FolderOpen, Search } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface BlenderPathSelectorProps {
  value: string | undefined;
  onChange: (path: string) => void;
}

interface BlenderVersion {
  path: string;
  version: string;
}

const BlenderPathSelector: React.FC<BlenderPathSelectorProps> = ({
  value = "",
  onChange,
}) => {
  const [isDetecting, setIsDetecting] = useState(false);
  const [availableVersions, setAvailableVersions] = useState<BlenderVersion[]>(
    []
  );

  const detectBlender = async (showNotification = false) => {
    setIsDetecting(true);
    try {
      const result = await window.electronAPI.detectBlender();
      if (result && Array.isArray(result) && result.length > 0) {
        setAvailableVersions(result);
        // Se non c'è già una versione selezionata, usa la prima disponibile
        if (!value) {
          onChange(result[0].path);
        }
        if (showNotification) {
          toast.success("Blender versions detected", {
            description: `Found ${result.length} Blender installation(s)`,
          });
        }
      } else if (showNotification) {
        toast.error("Blender not found", {
          description:
            "Could not find Blender installation. Please select it manually.",
        });
      }
    } catch (error) {
      if (showNotification) {
        toast.error("Error", {
          description: "Failed to detect Blender installation.",
        });
      }
      console.error("Error detecting Blender:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  // Esegui l'autodetect all'avvio del componente (silenzioso)
  useEffect(() => {
    detectBlender(false);
  }, []);

  const handleManualSelect = async () => {
    try {
      const result = await window.electronAPI.openFileDialog({
        filters: [
          { name: "Blender Executable", extensions: ["exe", "app", "blender"] },
        ],
      });
      if (result && result.length > 0) {
        const newPath = result[0];
        onChange(newPath);
        // Aggiungi la nuova versione alla lista se non è già presente
        if (!availableVersions.some((v) => v.path === newPath)) {
          setAvailableVersions((prev) => [
            ...prev,
            { path: newPath, version: "Custom" },
          ]);
        }
        toast.success("Blender path set", {
          description: `Selected Blender at: ${newPath}`,
        });
      }
    } catch (error) {
      toast.error("Error", {
        description: "Failed to select Blender executable.",
      });
    }
  };

  const handleVersionSelect = (path: string) => {
    onChange(path);
  };

  return (
    <div className="flex items-center gap-2">
      {availableVersions.length > 0 ? (
        <Select value={value} onValueChange={handleVersionSelect}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Select Blender version" />
          </SelectTrigger>
          <SelectContent>
            {availableVersions.map((version) => (
              <SelectItem key={version.path} value={version.path}>
                Blender {version.version}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          value={value || ""}
          readOnly
          placeholder="Select Blender executable"
          className="w-[300px]"
        />
      )}
      <Button
        variant="outline"
        size="icon"
        onClick={() => detectBlender(true)}
        disabled={isDetecting}
        title="Auto-detect Blender"
      >
        <Search className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={handleManualSelect}
        title="Select Blender manually"
      >
        <FolderOpen className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default BlenderPathSelector;
