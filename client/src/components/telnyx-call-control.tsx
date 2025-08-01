import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Phone, PhoneOff, Pause, Play, Radio, RadioIcon, Mic, MicOff } from "lucide-react";
import type { Call } from "@shared/schema";
import { useTelnyxMedia } from "@/hooks/use-telnyx-media";

interface TelnyxCallControlProps {
  call: Call;
  onCallAction: (action: string, data?: any) => void;
}

export function TelnyxCallControl({ call, onCallAction }: TelnyxCallControlProps) {
  const [isOnHold, setIsOnHold] = useState(call.status === 'held');
  const [isMuted, setIsMuted] = useState(false);
  const [elapsedTime, setElapsedTime] = useState<string>('00:00');
  
  // Initialize Telnyx media for this call
  const telnyxMedia = useTelnyxMedia(call.callId);

  // Calculate elapsed time
  useEffect(() => {
    if (call.status === 'active' && call.startTime) {
      const interval = setInterval(() => {
        const now = new Date();
        const start = new Date(call.startTime!);
        const elapsed = Math.floor((now.getTime() - start.getTime()) / 1000);
        
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        setElapsedTime(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [call.status, call.startTime]);

  // Auto-start audio streaming when call becomes active (but not if it's ending)
  useEffect(() => {
    if (call.status === 'active' && !telnyxMedia.isStreaming) {
      console.log('Auto-starting audio stream for active call:', call.callId);
      // Add a small delay to ensure call is fully established
      setTimeout(() => {
        if (call.status === 'active') {
          telnyxMedia.startMediaStream('both_tracks');
        }
      }, 1000);
    }
  }, [call.status, call.callId, telnyxMedia.isStreaming]);

  const handleHold = () => {
    const action = isOnHold ? 'resume' : 'hold';
    setIsOnHold(!isOnHold);
    onCallAction(action, { callId: call.callId });
  };

  const handleHangup = () => {
    onCallAction('hangup', { callId: call.callId });
  };

  const getCallStatusBadge = () => {
    switch (call.status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'held':
        return <Badge variant="secondary">On Hold</Badge>;
      case 'ringing':
        return <Badge variant="outline">Ringing</Badge>;
      case 'conference':
        return <Badge variant="default">Conference</Badge>;
      default:
        return <Badge variant="secondary">{call.status}</Badge>;
    }
  };



  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Call: {call.toNumber}
          </div>
          <div className="flex gap-2">
            {getCallStatusBadge()}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Call Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">To:</span> {call.toNumber}
          </div>
          <div>
            <span className="font-medium">From:</span> {call.fromNumber}
          </div>
          <div>
            <span className="font-medium">Status:</span> {call.status}
          </div>
          <div>
            <span className="font-medium">Duration:</span> {call.status === 'active' ? elapsedTime : '00:00'}
          </div>
        </div>

        {/* Audio Streaming Controls - Only show for active calls */}
        {call.status === 'active' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-blue-700">Audio Streaming</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${telnyxMedia.isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-xs text-blue-600">
                  {telnyxMedia.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
            
            <div className="flex space-x-2">
              <Button
                size="sm"
                variant={telnyxMedia.isStreaming ? "default" : "outline"}
                onClick={async () => {
                  console.log('Manual audio toggle, call status:', call.status);
                  
                  // Only allow audio controls for active calls
                  if (call.status !== 'active') {
                    console.warn('Cannot toggle audio for non-active call');
                    return;
                  }
                  
                  if (telnyxMedia.isStreaming) {
                    telnyxMedia.stopMediaStream();
                  } else {
                    // Initialize audio context first (user interaction required)
                    try {
                      telnyxMedia.startMediaStream('both_tracks');
                    } catch (error) {
                      console.error('Failed to initialize audio:', error);
                    }
                  }
                }}
                className="flex items-center space-x-1"
                data-testid="button-audio-toggle"
                disabled={call.status !== 'active'}
              >
                <Radio className="w-3 h-3" />
                <span>{telnyxMedia.isStreaming ? 'Stop Audio' : 'Start Audio'}</span>
              </Button>
              
              <Button
                size="sm"
                variant={isMuted ? "default" : "outline"}
                onClick={() => {
                  setIsMuted(!isMuted);
                  telnyxMedia.toggleMute();
                }}
                className="flex items-center space-x-1"
                data-testid="button-mute-toggle"
              >
                {isMuted ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                <span>{isMuted ? 'Unmute' : 'Mute'}</span>
              </Button>
              
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  // Test audio playback with a simple tone
                  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                  const oscillator = audioContext.createOscillator();
                  const gainNode = audioContext.createGain();
                  
                  oscillator.connect(gainNode);
                  gainNode.connect(audioContext.destination);
                  
                  oscillator.frequency.value = 440; // A4 note
                  gainNode.gain.value = 0.1;
                  
                  oscillator.start();
                  oscillator.stop(audioContext.currentTime + 0.5);
                  
                  console.log('🔊 Test tone played');
                }}
                className="flex items-center space-x-1"
                data-testid="button-test-audio"
              >
                <Radio className="w-3 h-3" />
                <span>Test</span>
              </Button>
            </div>
            
            <div className="mt-2 text-xs text-blue-600">
              Status: {telnyxMedia.isStreaming ? 'Streaming Active' : 'Streaming Inactive'} •
              WebSocket: {telnyxMedia.isConnected ? 'Connected' : 'Disconnected'}
              {telnyxMedia.streamId && ` • Stream ID: ${telnyxMedia.streamId.slice(0, 8)}...`}
            </div>

            {telnyxMedia.error && (
              <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                Audio Error: {telnyxMedia.error}
              </div>
            )}
          </div>
        )}



        {/* Call Control Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleHold}
            variant={isOnHold ? "default" : "outline"}
            className="flex-1"
          >
            {isOnHold ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
            {isOnHold ? 'Resume' : 'Hold'}
          </Button>
          
          <Button
            onClick={handleHangup}
            variant="destructive"
            className="flex-1"
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            Hang Up
          </Button>
        </div>


      </CardContent>
    </Card>
  );
}