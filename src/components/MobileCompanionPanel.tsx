import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Smartphone,
  Wifi,
  WifiOff,
  QrCode,
  Users,
  Trash2,
  RefreshCw,
  Copy,
  CheckCircle2,
  AlertCircle,
  Settings,
  Server,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import QRCode from "qrcode";

// Import types from the global types file
interface MobileServerStatus {
  isRunning: boolean;
  port?: number;
  connectedDevices?: number;
  pairedDevices?: number;
  currentPairingCode?: string;
  networkIP?: string;
}

interface PairedDevice {
  id: string;
  name: string;
  connectedAt: string;
  lastSeen: string;
  isConnected: boolean;
}

interface ConnectedDevice {
  deviceId: string;
  deviceName: string;
}

export default function MobileCompanionPanel() {
  const [serverStatus, setServerStatus] = useState<MobileServerStatus>({
    isRunning: false,
  });
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>(
    []
  );
  const [currentPairingCode, setCurrentPairingCode] = useState<string | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showPairingDialog, setShowPairingDialog] = useState(false);
  const [pairingCodeExpiry, setPairingCodeExpiry] = useState<number | null>(
    null
  );
  const [timeRemaining, setTimeRemaining] = useState<string>("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);

  // Load initial data
  useEffect(() => {
    loadServerStatus();
    loadPairedDevices();
    loadConnectedDevices();

    // Listen for mobile server events
    const handleServerStatus = (status: any) => {
      setServerStatus(status);
    };

    const handleDevicePaired = (data: any) => {
      toast.success("Device Paired", {
        description: `${data.deviceName} has been paired successfully.`,
      });
      loadPairedDevices();
      loadConnectedDevices();
    };

    const handlePairingCodeGenerated = (code: string) => {
      setCurrentPairingCode(code);
      setPairingCodeExpiry(Date.now() + 5 * 60 * 1000); // 5 minutes
      setShowPairingDialog(true);
    };

    const handlePairingCodeCleared = () => {
      setCurrentPairingCode(null);
      setPairingCodeExpiry(null);
      setShowPairingDialog(false);
    };

    // Register event listeners
    window.electronAPI.onMobileServerStatus?.(handleServerStatus);
    window.electronAPI.onDevicePaired?.(handleDevicePaired);
    window.electronAPI.onPairingCodeGenerated?.(handlePairingCodeGenerated);
    window.electronAPI.onPairingCodeCleared?.(handlePairingCodeCleared);

    return () => {
      // Cleanup listeners if needed
    };
  }, []);

  // Countdown timer for pairing code
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (pairingCodeExpiry && currentPairingCode) {
      const updateTimer = () => {
        const remaining = pairingCodeExpiry - Date.now();
        if (remaining <= 0) {
          setCurrentPairingCode(null);
          setPairingCodeExpiry(null);
          setShowPairingDialog(false);
          setTimeRemaining("");
        } else {
          const minutes = Math.floor(remaining / 60000);
          const seconds = Math.floor((remaining % 60000) / 1000);
          setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, "0")}`);
        }
      };

      // Update immediately
      updateTimer();

      // Then update every second
      interval = setInterval(updateTimer, 1000);
    } else {
      setTimeRemaining("");
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [pairingCodeExpiry, currentPairingCode]);

  const loadServerStatus = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.mobileServerStatus();
      if (result.success && result.status) {
        setServerStatus(result.status);
      }
    } catch (error) {
      console.error("Error loading server status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPairedDevices = async () => {
    try {
      const result = await window.electronAPI.getPairedDevices();
      if (result.success) {
        setPairedDevices(result.devices || []);
      }
    } catch (error) {
      console.error("Error loading paired devices:", error);
    }
  };

  const loadConnectedDevices = async () => {
    try {
      const result = await window.electronAPI.getConnectedDevices();
      if (result.success) {
        setConnectedDevices(result.devices || []);
      }
    } catch (error) {
      console.error("Error loading connected devices:", error);
    }
  };

  const handleStartServer = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.mobileServerStart();
      if (result.success && result.status) {
        setServerStatus(result.status);
        toast.success("Server Started", {
          description: "Mobile/Blender Companion Server is now running.",
        });
        loadPairedDevices();
        loadConnectedDevices();
      } else {
        toast.error("Failed to Start Server", {
          description: result.error || "Unknown error occurred.",
        });
      }
    } catch (error) {
      console.error("Error starting server:", error);
      toast.error("Error", {
        description: "Failed to start the mobile/blender companion server.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopServer = async () => {
    setIsLoading(true);
    try {
      const result = await window.electronAPI.mobileServerStop();
      if (result.success) {
        setServerStatus({ isRunning: false });
        setCurrentPairingCode(null);
        setPairingCodeExpiry(null);
        setShowPairingDialog(false);
        toast.success("Server Stopped", {
          description: "Mobile/Blender Companion Server has been stopped.",
        });
      } else {
        toast.error("Failed to Stop Server", {
          description: result.error || "Unknown error occurred.",
        });
      }
    } catch (error) {
      console.error("Error stopping server:", error);
      toast.error("Error", {
        description: "Failed to stop the mobile/blender companion server.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const generateQRCode = async (code: string) => {
    try {
      let hostname = "localhost"; // Default to localhost

      // If the server is running, try to get its actual network IP
      if (serverStatus.isRunning) {
        try {
          const result = await window.electronAPI.mobileServerStatus();
          console.log("Mobile server status result:", result);
          if (
            result &&
            result.status &&
            result.status.networkIP &&
            result.status.networkIP !== "127.0.0.1" &&
            result.status.networkIP !== "localhost"
          ) {
            hostname = result.status.networkIP;
          }
        } catch (error) {
          console.warn(
            "Could not get network IP from server status, using localhost:",
            error
          );
          hostname = "localhost"; // Keep localhost as fallback
        }
      }

      // Create QR code data with pairing information
      const qrData = JSON.stringify({
        type: "brs-pairing",
        code: code,
        serverUrl: `http://${hostname}:8080`,
        timestamp: Date.now(),
      });

      console.log(
        "Generated QR code with serverUrl:",
        `http://${hostname}:8080`
      );

      // Generate actual QR code using the qrcode library
      const qrCodeDataUrl = await QRCode.toDataURL(qrData, {
        width: 240,
        margin: 2,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
        errorCorrectionLevel: "M",
      });

      setQrCodeDataUrl(qrCodeDataUrl);
    } catch (error) {
      console.error("Error generating QR code:", error);
      setQrCodeDataUrl(null);
    }
  };

  const handleGeneratePairingCode = async () => {
    if (!serverStatus.isRunning) {
      toast.error("Server Not Running", {
        description: "Please start the mobile/blender companion server first.",
      });
      return;
    }

    try {
      const result = await window.electronAPI.generatePairingCode();
      if (result.success && result.code) {
        setCurrentPairingCode(result.code);
        setPairingCodeExpiry(Date.now() + 5 * 60 * 1000);
        await generateQRCode(result.code);
        setShowPairingDialog(true);
        toast.success("Pairing Code Generated", {
          description: "A new pairing code has been generated.",
        });
      } else {
        toast.error("Failed to Generate Code", {
          description: result.error || "Unknown error occurred.",
        });
      }
    } catch (error) {
      console.error("Error generating pairing code:", error);
      toast.error("Error", {
        description: "Failed to generate pairing code.",
      });
    }
  };

  const handleClearPairingCode = async () => {
    try {
      await window.electronAPI.clearPairingCode();
      setCurrentPairingCode(null);
      setPairingCodeExpiry(null);
      setShowPairingDialog(false);
      setQrCodeDataUrl(null);
    } catch (error) {
      console.error("Error clearing pairing code:", error);
    }
  };

  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const result = await window.electronAPI.removePairedDevice(deviceId);
      if (result.success && result.removed) {
        toast.success("Device Removed", {
          description: "The device has been unpaired successfully.",
        });
        loadPairedDevices();
        loadConnectedDevices();
      } else {
        toast.error("Failed to Remove Device", {
          description: "Could not remove the paired device.",
        });
      }
    } catch (error) {
      console.error("Error removing device:", error);
      toast.error("Error", {
        description: "Failed to remove the device.",
      });
    }
  };

  const copyPairingCode = () => {
    if (currentPairingCode) {
      navigator.clipboard.writeText(currentPairingCode);
      toast.success("Copied", {
        description: "Pairing code copied to clipboard.",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Server Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Server Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {serverStatus.isRunning ? (
                  <Wifi className="h-5 w-5 text-green-500" />
                ) : (
                  <WifiOff className="h-5 w-5 text-gray-500" />
                )}
                <span className="font-medium">
                  {serverStatus.isRunning ? "Running" : "Stopped"}
                </span>
                {serverStatus.isRunning && serverStatus.port && (
                  <Badge variant="secondary">Port {serverStatus.port}</Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={loadServerStatus}
                  variant="ghost"
                  size="sm"
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>

                {serverStatus.isRunning ? (
                  <Button
                    onClick={handleStopServer}
                    variant="destructive"
                    disabled={isLoading}
                  >
                    Stop Server
                  </Button>
                ) : (
                  <Button
                    onClick={handleStartServer}
                    variant="default"
                    disabled={isLoading}
                  >
                    Start Server
                  </Button>
                )}
              </div>
            </div>

            {serverStatus.isRunning && (
              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-500">
                    {connectedDevices.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Connected</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-500">
                    {pairedDevices.length}
                  </div>
                  <div className="text-sm text-muted-foreground">Paired</div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pairing Section */}
      {serverStatus.isRunning && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Device Pairing
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Generate a pairing code to connect a new mobile device.
              </p>

              <Button
                onClick={handleGeneratePairingCode}
                disabled={!!currentPairingCode}
                className="w-full"
              >
                Generate Pairing Code
              </Button>

              {currentPairingCode && (
                <div className="bg-muted p-4 rounded-lg text-center">
                  <div className="text-3xl font-mono font-bold mb-2">
                    {currentPairingCode}
                  </div>
                  <div className="text-sm text-muted-foreground mb-3">
                    Expires in: {timeRemaining}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={copyPairingCode}
                      variant="outline"
                      size="sm"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Code
                    </Button>
                    <Button
                      onClick={handleClearPairingCode}
                      variant="ghost"
                      size="sm"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Connected Devices */}
      {serverStatus.isRunning && connectedDevices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Connected Devices ({connectedDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-40">
              <div className="space-y-2">
                {connectedDevices.map((device) => (
                  <div
                    key={device.deviceId}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="font-medium">{device.deviceName}</span>
                    </div>
                    <Badge variant="outline" className="text-green-600">
                      Connected
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Paired Devices */}
      {pairedDevices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              Paired Devices ({pairedDevices.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-60">
              <div className="space-y-2">
                {pairedDevices.map((device) => (
                  <div
                    key={device.id}
                    className="flex items-center justify-between p-3 bg-muted rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      {device.isConnected ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-gray-500" />
                      )}
                      <div>
                        <div className="font-medium">{device.name}</div>
                        <div className="text-xs text-muted-foreground">
                          Last seen:{" "}
                          {new Date(device.lastSeen).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        variant={device.isConnected ? "default" : "secondary"}
                        className={device.isConnected ? "text-green-600" : ""}
                      >
                        {device.isConnected ? "Connected" : "Offline"}
                      </Badge>
                      <Button
                        onClick={() => handleRemoveDevice(device.id)}
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Pairing Code Dialog */}
      <Dialog open={showPairingDialog} onOpenChange={setShowPairingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mobile Device Pairing</DialogTitle>
            <DialogDescription>
              Enter this code in your mobile device to pair it with this
              computer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Tabs defaultValue="code" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="code">6-Digit Code</TabsTrigger>
                <TabsTrigger value="qr">QR Code</TabsTrigger>
              </TabsList>

              <TabsContent value="code" className="space-y-4">
                <div className="text-center">
                  <div className="text-6xl font-mono font-bold text-primary mb-4">
                    {currentPairingCode}
                  </div>

                  <div className="text-sm text-muted-foreground mb-4">
                    This code will expire in: <strong>{timeRemaining}</strong>
                  </div>

                  <div className="flex gap-2 justify-center">
                    <Button onClick={copyPairingCode} variant="outline">
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Code
                    </Button>
                    <Button
                      onClick={handleClearPairingCode}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong>Instructions:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open the BRS Mobile Companion app on your device</li>
                    <li>Tap "Pair Device" or "Connect"</li>
                    <li>Enter the 6-digit code shown above</li>
                    <li>Tap "Pair Device" to complete the connection</li>
                  </ol>
                </div>
              </TabsContent>

              <TabsContent value="qr" className="space-y-4">
                <div className="text-center">
                  <div className="mb-4">
                    {qrCodeDataUrl ? (
                      <img
                        src={qrCodeDataUrl}
                        alt="QR Code for pairing"
                        className="mx-auto border rounded-lg bg-white p-4"
                        style={{ width: "240px", height: "240px" }}
                      />
                    ) : (
                      <div className="w-60 h-60 mx-auto border rounded-lg bg-muted flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                          <QrCode className="h-12 w-12 mx-auto mb-2" />
                          <p>Generating QR Code...</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="text-sm text-muted-foreground mb-4">
                    This code will expire in: <strong>{timeRemaining}</strong>
                  </div>

                  <div className="flex gap-2 justify-center">
                    <Button
                      onClick={handleClearPairingCode}
                      variant="secondary"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>

                <Separator />

                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    <strong>Instructions:</strong>
                  </p>
                  <ol className="list-decimal list-inside space-y-1">
                    <li>Open the BRS Mobile Companion app on your device</li>
                    <li>Use your camera to scan the QR code above</li>
                    <li>Follow the automatic pairing process</li>
                    <li>Wait for the connection confirmation</li>
                  </ol>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
