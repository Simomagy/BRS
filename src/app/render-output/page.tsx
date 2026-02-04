'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, FolderOpen, Image as ImageIcon, Film, AlertCircle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

interface RenderOutput {
  id: string;
  name: string;
  status: 'running' | 'completed' | 'failed';
  outputPath: string;
  outputFile?: string;
  isVideo: boolean;
  progress?: number;
  currentFrame?: number;
  totalFrames?: number;
  startTime: string;
  endTime?: string;
  thumbnail?: string;
}

export default function RenderOutputPage() {
  const [renders, setRenders] = useState<RenderOutput[]>([]);
  const [selectedRenderId, setSelectedRenderId] = useState<string | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const selectedRender = renders.find(r => r.id === selectedRenderId);

  useEffect(() => {
    // Load initial render list
    loadRenderOutputs();

    // Listen for new render events
    if (window.electronAPI) {
      window.electronAPI.on('render-output-started', (data: any) => {
        addOrUpdateRender({
          id: data.processId,
          name: data.name || `Render ${data.processId}`,
          status: 'running',
          outputPath: data.outputPath || '',
          outputFile: data.outputFile,
          isVideo: data.isVideo || false,
          progress: 0,
          currentFrame: 0,
          totalFrames: data.totalFrames || 1,
          startTime: data.startTime || new Date().toISOString(),
        });
      });

      window.electronAPI.on('render-output-progress', (data: any) => {
        updateRender(data.processId, {
          progress: data.progress,
          currentFrame: data.currentFrame,
          outputFile: data.outputFile,
        });

        // If it's an animation, reload the last completed frame
        if (data.outputFile && selectedRenderId === data.processId) {
          loadImagePreview(data.outputFile);
        }
      });

      window.electronAPI.on('render-output-completed', (data: any) => {
        updateRender(data.processId, {
          status: 'completed',
          progress: 100,
          endTime: new Date().toISOString(),
          outputFile: data.outputFile,
        });

        // Auto-select the completed render
        setSelectedRenderId(data.processId);

        // Load the preview
        if (data.outputFile && !data.isVideo) {
          loadImagePreview(data.outputFile);
        }
      });

      window.electronAPI.on('render-output-failed', (data: any) => {
        updateRender(data.processId, {
          status: 'failed',
          endTime: new Date().toISOString(),
        });
      });
    }

    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeAllListeners('render-output-started');
        window.electronAPI.removeAllListeners('render-output-progress');
        window.electronAPI.removeAllListeners('render-output-completed');
        window.electronAPI.removeAllListeners('render-output-failed');
      }
    };
  }, [selectedRenderId]);

  const loadRenderOutputs = async () => {
    if (window.electronAPI && window.electronAPI.getRenderOutputs) {
      try {
        const outputs = await window.electronAPI.getRenderOutputs();
        setRenders(outputs);

        // Auto-select the most recent one
        if (outputs.length > 0 && !selectedRenderId) {
          const latest = outputs[0];
          setSelectedRenderId(latest.id);
          if (latest.outputFile && !latest.isVideo) {
            loadImagePreview(latest.outputFile);
          }
        }
      } catch (error) {
        console.error('Failed to load render outputs:', error);
      }
    }
  };

  const addOrUpdateRender = (render: RenderOutput) => {
    setRenders(prev => {
      const existing = prev.find(r => r.id === render.id);
      if (existing) {
        return prev.map(r => r.id === render.id ? { ...r, ...render } : r);
      }
      return [render, ...prev];
    });
  };

  const updateRender = (id: string, updates: Partial<RenderOutput>) => {
    setRenders(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const loadImagePreview = async (filePath: string) => {
    if (!window.electronAPI || !window.electronAPI.readImageAsBase64) {
      setImageError('Image preview not available');
      return;
    }

    try {
      setImageError(null);
      const base64 = await window.electronAPI.readImageAsBase64(filePath);
      if (base64) {
        setImageData(base64);
      } else {
        setImageError('Failed to load image');
      }
    } catch (error) {
      console.error('Error loading image:', error);
      setImageError('Error loading image preview');
    }
  };

  const handleOpenFolder = async () => {
    if (!selectedRender || !window.electronAPI) return;

    const folderPath = selectedRender.outputPath ||
      (selectedRender.outputFile ? selectedRender.outputFile.split(/[\\/]/).slice(0, -1).join('/') : null);

    if (folderPath) {
      await window.electronAPI.openPath(folderPath);
    }
  };

  const handleSelectRender = (render: RenderOutput) => {
    setSelectedRenderId(render.id);
    setImageData(null);
    setImageError(null);

    if (render.outputFile && !render.isVideo && render.status === 'completed') {
      loadImagePreview(render.outputFile);
    }
  };

  return (
    <div className="flex h-screen bg-black text-white">
      {/* Sidebar - Render List */}
      <div className="w-80 border-r border-neutral-800 flex flex-col">
        <div className="p-4 border-b border-neutral-800">
          <h2 className="text-lg font-semibold">Render Outputs</h2>
          <p className="text-sm text-muted-foreground">
            {renders.length} render{renders.length !== 1 ? 's' : ''}
          </p>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2 space-y-2">
            {renders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertCircle className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No renders available</p>
                <p className="text-xs mt-1">Start a render to see output here</p>
              </div>
            ) : (
              renders.map((render) => (
                <Card
                  key={render.id}
                  className={`cursor-pointer transition-colors ${
                    selectedRenderId === render.id
                      ? 'bg-neutral-800 border-primary'
                      : 'bg-neutral-900 border-transparent hover:border-neutral-700'
                  }`}
                  onClick={() => handleSelectRender(render)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {render.isVideo ? (
                          <Film className="h-4 w-4 text-blue-500" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-green-500" />
                        )}
                        <span className="text-sm font-medium truncate">
                          {render.name}
                        </span>
                      </div>
                      {render.status === 'running' && (
                        <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      )}
                      {render.status === 'completed' && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      )}
                      {render.status === 'failed' && (
                        <AlertCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(render.startTime), 'PPp')}
                      </div>

                      {render.status === 'running' && render.totalFrames && render.totalFrames > 1 && (
                        <div className="text-xs">
                          Frame {render.currentFrame || 0} / {render.totalFrames}
                        </div>
                      )}

                      {render.status === 'running' && render.progress !== undefined && (
                        <div className="w-full bg-neutral-700 rounded-full h-1.5">
                          <div
                            className="bg-blue-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${render.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Content - Preview */}
      <div className="flex-1 flex flex-col">
        {!selectedRender ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <ImageIcon className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p className="text-lg">No render selected</p>
              <p className="text-sm mt-2">Select a render from the list to view output</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{selectedRender.name}</h3>
                <p className="text-sm text-muted-foreground">
                  {selectedRender.status === 'running' && 'Rendering in progress...'}
                  {selectedRender.status === 'completed' && 'Render completed'}
                  {selectedRender.status === 'failed' && 'Render failed'}
                </p>
              </div>
              <Button
                onClick={handleOpenFolder}
                disabled={!selectedRender.outputPath && !selectedRender.outputFile}
                className="gap-2"
              >
                <FolderOpen className="h-4 w-4" />
                Open Folder
              </Button>
            </div>

            {/* Preview Area */}
            <div className="flex-1 overflow-auto p-4 bg-neutral-950">
              {selectedRender.status === 'running' && !imageData && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
                    <p className="text-lg">Rendering...</p>
                    {selectedRender.totalFrames && selectedRender.totalFrames > 1 && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Frame {selectedRender.currentFrame || 0} of {selectedRender.totalFrames}
                      </p>
                    )}
                    {selectedRender.progress !== undefined && (
                      <div className="w-64 mx-auto mt-4">
                        <div className="w-full bg-neutral-700 rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full transition-all"
                            style={{ width: `${selectedRender.progress}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                          {selectedRender.progress?.toFixed(1)}%
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedRender.isVideo && selectedRender.status === 'completed' && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <Film className="h-16 w-16 mx-auto mb-4 text-blue-500" />
                    <p className="text-lg">Video Render Completed</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Preview not available for video files
                    </p>
                    <Button onClick={handleOpenFolder} className="mt-4 gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Open Output Folder
                    </Button>
                  </div>
                </div>
              )}

              {!selectedRender.isVideo && imageError && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-red-500">
                    <AlertCircle className="h-12 w-12 mx-auto mb-4" />
                    <p>{imageError}</p>
                  </div>
                </div>
              )}

              {!selectedRender.isVideo && imageData && (
                <div className="flex items-center justify-center min-h-full p-4">
                  <img
                    src={imageData}
                    alt="Render output"
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    style={{ imageRendering: 'auto' }}
                  />
                </div>
              )}

              {selectedRender.status === 'failed' && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-red-500">
                    <AlertCircle className="h-16 w-16 mx-auto mb-4" />
                    <p className="text-lg">Render Failed</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Check the logs for more information
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
