import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Headphones, 
  Mic, 
  MicOff, 
  Radio, 
  Activity,
  AlertTriangle,
  CheckCircle,
  Info
} from "lucide-react";
import { useDesktopAudio } from "@/hooks/use-desktop-audio";
import { type Call } from "@shared/schema";

interface DesktopAudioPanelProps {
  activeCall: Call | null;
}

export function DesktopAudioPanel({ activeCall }: DesktopAudioPanelProps) {
  const {
    isConnected,
    isStreaming,
    audioLevel,
    startAudioStream,
    stopAudioStream,
    toggleMute,
    isMuted,
    error
  } = useDesktopAudio();

  const handleStartStream = () => {
    if (activeCall) {
      startAudioStream(activeCall.id);
    }
  };

  const getConnectionBadge = () => {
    if (error) return <Badge variant="destructive">Error</Badge>;
    if (isConnected) return <Badge variant="default">Connected</Badge>;
    return <Badge variant="secondary">Disconnected</Badge>;
  };

  const getConnectionIcon = () => {
    if (error) return <AlertTriangle className="w-4 h-4 text-red-500" />;
    if (isConnected) return <CheckCircle className="w-4 h-4 text-green-500" />;
    return <Info className="w-4 h-4 text-gray-500" />;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5" />
            Desktop Audio Streaming
          </div>
          {getConnectionBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          {getConnectionIcon()}
          <span className="text-sm">
            {error ? error :
             isConnected ? 'WebSocket connected - ready for audio' :
             'Connecting to audio server...'}
          </span>
        </div>

        {/* Active Call Info */}
        {activeCall && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Active call with {activeCall.toNumber} - Call status: {activeCall.status}
            </AlertDescription>
          </Alert>
        )}

        {/* Audio Controls */}
        {activeCall && activeCall.status === 'active' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {!isStreaming ? (
                <Button 
                  onClick={handleStartStream}
                  disabled={!isConnected}
                  className="flex-1"
                >
                  <Radio className="w-4 h-4 mr-2" />
                  Start Audio Stream
                </Button>
              ) : (
                <Button 
                  onClick={stopAudioStream}
                  variant="destructive"
                  className="flex-1"
                >
                  <Radio className="w-4 h-4 mr-2" />
                  Stop Stream
                </Button>
              )}
              
              {isStreaming && (
                <Button
                  onClick={toggleMute}
                  variant={isMuted ? "destructive" : "outline"}
                  size="icon"
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </Button>
              )}
            </div>

            {/* Audio Level Indicator */}
            {isStreaming && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <span className="text-sm">
                    Microphone Level: {audioLevel}%
                    {isMuted && <span className="text-red-500 ml-2">(Muted)</span>}
                  </span>
                </div>
                <Progress value={audioLevel} className="w-full" />
              </div>
            )}
          </div>
        )}

        {/* No Active Call */}
        {!activeCall && (
          <div className="text-sm text-muted-foreground text-center py-6">
            Start a call to enable audio streaming
          </div>
        )}

        {/* Call Not Active */}
        {activeCall && activeCall.status !== 'active' && (
          <div className="text-sm text-muted-foreground text-center py-4">
            Call must be active to start audio streaming
            <br />
            Current status: {activeCall.status}
          </div>
        )}

        {/* Desktop Audio Info */}
        <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded">
          <strong>Desktop Audio Features:</strong>
          <ul className="mt-1 space-y-1">
            <li>• WebSocket-based bidirectional audio streaming</li>
            <li>• Microphone input with level monitoring</li>
            <li>• Speaker output for incoming audio</li>
            <li>• Optimized for Electron desktop applications</li>
          </ul>
        </div>

        {/* Technical Status */}
        {isStreaming && (
          <div className="text-xs text-gray-500 border-t pt-2">
            <div>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</div>
            <div>Audio Stream: {isStreaming ? 'Active' : 'Inactive'}</div>
            <div>Microphone: {isMuted ? 'Muted' : 'Active'}</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}