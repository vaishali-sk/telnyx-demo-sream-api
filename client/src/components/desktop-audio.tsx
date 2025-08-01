import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  Headphones,
  Radio,
  Activity
} from "lucide-react";

interface AudioStreamingProps {
  callId?: string;
  isActive: boolean;
  onStreamToggle: (streaming: boolean) => void;
}

export function DesktopAudioStreaming({ callId, isActive, onStreamToggle }: AudioStreamingProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);

  // Initialize WebSocket connection for audio streaming
  useEffect(() => {
    if (isActive && callId) {
      connectAudioStream();
    } else {
      disconnectAudioStream();
    }

    return () => {
      disconnectAudioStream();
    };
  }, [isActive, callId]);

  const connectAudioStream = async () => {
    try {
      setConnectionStatus('connecting');
      
      // Create WebSocket connection to audio streaming server
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/audio`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('Audio WebSocket connected');
        setIsConnected(true);
        setConnectionStatus('connected');
        
        // Set the call ID for this audio stream
        if (callId && wsRef.current) {
          wsRef.current.send(JSON.stringify({
            type: 'set_call',
            callId
          }));
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleAudioMessage(message);
        } catch (error) {
          console.error('Failed to parse audio message:', error);
        }
      };
      
      wsRef.current.onclose = () => {
        console.log('Audio WebSocket disconnected');
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setIsStreaming(false);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('Audio WebSocket error:', error);
        setConnectionStatus('error');
      };
      
    } catch (error) {
      console.error('Failed to connect audio stream:', error);
      setConnectionStatus('error');
    }
  };

  const disconnectAudioStream = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsConnected(false);
    setIsStreaming(false);
    setConnectionStatus('disconnected');
  };

  const handleAudioMessage = (message: any) => {
    switch (message.type) {
      case 'connected':
        console.log('Audio streaming connection established');
        break;
      
      case 'stream_started':
        setIsStreaming(true);
        onStreamToggle(true);
        break;
      
      case 'stream_stopped':
        setIsStreaming(false);
        onStreamToggle(false);
        break;
      
      case 'call_ended':
        setIsStreaming(false);
        onStreamToggle(false);
        disconnectAudioStream();
        break;
      
      case 'audio_data':
        // Handle incoming audio data for desktop playback
        handleIncomingAudio(message.audioData);
        break;
    }
  };

  const startAudioStream = async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      
      // Set up audio context and analyser for visual feedback
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const source = audioContextRef.current.createMediaStreamSource(stream);
      audioAnalyserRef.current = audioContextRef.current.createAnalyser();
      source.connect(audioAnalyserRef.current);
      
      // Start monitoring audio levels
      monitorAudioLevel();
      
      // Send start stream message
      if (wsRef.current && callId) {
        wsRef.current.send(JSON.stringify({
          type: 'start_stream',
          callId
        }));
      }
      
    } catch (error) {
      console.error('Failed to start audio stream:', error);
      alert('Microphone access required for audio streaming');
    }
  };

  const stopAudioStream = () => {
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_stream'
      }));
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const handleIncomingAudio = (audioData: string) => {
    // TODO: Implement desktop audio playback
    // This would decode base64 audio data and play it through speakers
    console.log('Received audio data for desktop playback:', audioData.length);
  };

  const monitorAudioLevel = () => {
    if (!audioAnalyserRef.current) return;
    
    const analyser = audioAnalyserRef.current;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    
    const checkLevel = () => {
      if (!analyser) return;
      
      analyser.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(Math.round((average / 255) * 100));
      
      if (isStreaming) {
        requestAnimationFrame(checkLevel);
      }
    };
    
    checkLevel();
  };

  const toggleMute = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted;
      });
      setIsMuted(!isMuted);
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'connecting': return 'bg-yellow-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headphones className="w-5 h-5" />
          Desktop Audio Streaming
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {connectionStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`} />
          <span className="text-sm">
            {connectionStatus === 'connected' ? 'Ready for audio streaming' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'error' ? 'Connection failed' :
             'Not connected'}
          </span>
        </div>

        {/* Audio Controls */}
        {isConnected && callId && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {!isStreaming ? (
                <Button 
                  onClick={startAudioStream}
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
                  variant="outline"
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
                  <span className="text-sm">Audio Level: {audioLevel}%</span>
                </div>
                <Progress value={audioLevel} className="w-full" />
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!callId && (
          <div className="text-sm text-muted-foreground text-center py-4">
            Start a call to enable audio streaming
          </div>
        )}

        {/* Desktop Features Notice */}
        <div className="text-xs text-muted-foreground bg-blue-50 p-3 rounded">
          <strong>Desktop Features:</strong> Full audio streaming with microphone and speaker support. 
          Best performance when running as an Electron desktop application.
        </div>
      </CardContent>
    </Card>
  );
}