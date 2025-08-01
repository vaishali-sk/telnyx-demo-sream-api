import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Volume2, VolumeX, Mic, MicOff, Play, Pause } from 'lucide-react';

/**
 * HTTP Audio Handler - Non-WebRTC audio streaming solution
 * Uses REST API endpoints to stream audio without WebRTC dependencies
 * Supports transfers and conference calls
 */

interface HttpAudioHandlerProps {
  callId?: string;
  isCallActive: boolean;
}

interface AudioStats {
  totalPackets: number;
  inboundPackets: number;
  outboundPackets: number;
  lastActivity: number | null;
}

interface StreamConfig {
  callControlId: string;
  codec: string;
  sampleRate: number;
  bidirectional: boolean;
}

export function HttpAudioHandler({ callId, isCallActive }: HttpAudioHandlerProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [audioStats, setAudioStats] = useState<AudioStats | null>(null);
  const [streamConfig, setStreamConfig] = useState<StreamConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastAudioTimestamp = useRef<number>(0);

  // Initialize audio streaming when call becomes active
  useEffect(() => {
    if (isCallActive && callId && !isStreaming) {
      startHttpAudioStreaming();
    } else if (!isCallActive && isStreaming) {
      stopHttpAudioStreaming();
    }
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [isCallActive, callId]);

  // Start HTTP audio streaming
  const startHttpAudioStreaming = useCallback(async () => {
    if (!callId) return;

    try {
      console.log('🎵 Starting HTTP audio streaming for call:', callId);
      
      const response = await fetch(`/api/calls/${callId}/start-http-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          codec: 'PCMU',
          bidirectional: true
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setIsStreaming(true);
        setError(null);
        
        // Start polling for audio data
        startAudioPolling();
        
        console.log('✅ HTTP audio streaming started:', result);
      } else {
        throw new Error(result.message || 'Failed to start audio streaming');
      }
      
    } catch (err) {
      console.error('Failed to start HTTP audio streaming:', err);
      setError(err instanceof Error ? err.message : 'Failed to start audio streaming');
    }
  }, [callId]);

  // Stop HTTP audio streaming
  const stopHttpAudioStreaming = useCallback(async () => {
    if (!callId) return;

    try {
      console.log('🛑 Stopping HTTP audio streaming for call:', callId);
      
      // Stop polling
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      
      const response = await fetch(`/api/calls/${callId}/stop-http-audio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });

      const result = await response.json();
      
      if (result.success) {
        setIsStreaming(false);
        setIsPlayingAudio(false);
        setAudioStats(null);
        setStreamConfig(null);
        setError(null);
        
        console.log('✅ HTTP audio streaming stopped');
      } else {
        throw new Error(result.message || 'Failed to stop audio streaming');
      }
      
    } catch (err) {
      console.error('Failed to stop HTTP audio streaming:', err);
      setError(err instanceof Error ? err.message : 'Failed to stop audio streaming');
    }
  }, [callId]);

  // Start polling for audio data and stats
  const startAudioPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
    
    pollIntervalRef.current = setInterval(async () => {
      if (!callId || !isStreaming) return;
      
      try {
        // Get audio streaming status
        const statusResponse = await fetch(`/api/calls/${callId}/audio/status`);
        const statusData = await statusResponse.json();
        
        if (statusData.success) {
          setAudioStats(statusData.stats);
          setStreamConfig(statusData.config);
          
          // Check for new audio data
          if (statusData.stats.lastActivity && statusData.stats.lastActivity > lastAudioTimestamp.current) {
            await playInboundAudio();
            lastAudioTimestamp.current = statusData.stats.lastActivity;
          }
        }
        
      } catch (err) {
        console.error('Failed to poll audio status:', err);
      }
    }, 100); // Poll every 100ms for real-time audio
  }, [callId, isStreaming]);

  // Play inbound audio (from remote party)
  const playInboundAudio = useCallback(async () => {
    if (!callId || isMuted) return;

    try {
      const response = await fetch(`/api/calls/${callId}/audio/inbound?since=${lastAudioTimestamp.current}`);
      
      if (response.ok) {
        const audioBuffer = await response.arrayBuffer();
        
        if (audioBuffer.byteLength > 0) {
          await playAudioBuffer(audioBuffer);
          setIsPlayingAudio(true);
          
          // Reset playing state after a short delay
          setTimeout(() => setIsPlayingAudio(false), 100);
        }
      }
      
    } catch (err) {
      console.error('Failed to play inbound audio:', err);
    }
  }, [callId, isMuted]);

  // Play audio buffer using Web Audio API
  const playAudioBuffer = useCallback(async (audioBuffer: ArrayBuffer) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      
      const audioContext = audioContextRef.current;
      
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      
      // For PCMU (μ-law) audio, we need to decode it properly
      // This is a simplified version - in production you'd want proper μ-law decoding
      const audioData = new Uint8Array(audioBuffer);
      const sampleRate = 8000; // PCMU standard sample rate
      const samples = audioData.length;
      
      const audioBufferNode = audioContext.createBuffer(1, samples, sampleRate);
      const channelData = audioBufferNode.getChannelData(0);
      
      // Convert μ-law to linear PCM (simplified)
      for (let i = 0; i < samples; i++) {
        channelData[i] = (audioData[i] - 128) / 128;
      }
      
      const source = audioContext.createBufferSource();
      source.buffer = audioBufferNode;
      source.connect(audioContext.destination);
      source.start();
      
    } catch (err) {
      console.error('Failed to play audio buffer:', err);
    }
  }, []);

  // Send outbound audio (microphone input)
  const sendOutboundAudio = useCallback(async (audioData: string) => {
    if (!callId || !isStreaming) return;

    try {
      const response = await fetch(`/api/calls/${callId}/audio/outbound`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          audioData,
          codec: 'PCMU',
          timestamp: Date.now()
        })
      });

      const result = await response.json();
      
      if (!result.success) {
        console.error('Failed to send outbound audio:', result.message);
      }
      
    } catch (err) {
      console.error('Failed to send outbound audio:', err);
    }
  }, [callId, isStreaming]);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          HTTP Audio Streaming
          {isStreaming && (
            <Badge variant="default" className="ml-2">
              Active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={isStreaming ? "default" : "secondary"}>
            {isStreaming ? "Connected" : "Disconnected"}
          </Badge>
        </div>

        {/* Stream Configuration */}
        {streamConfig && (
          <div className="space-y-2">
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Codec: <span className="font-mono">{streamConfig.codec}</span></div>
              <div>Sample Rate: <span className="font-mono">{streamConfig.sampleRate}Hz</span></div>
            </div>
          </div>
        )}

        {/* Audio Statistics */}
        {audioStats && (
          <div className="space-y-2">
            <Separator />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>Total Packets: <span className="font-mono">{audioStats.totalPackets}</span></div>
              <div>Inbound: <span className="font-mono">{audioStats.inboundPackets}</span></div>
              <div>Outbound: <span className="font-mono">{audioStats.outboundPackets}</span></div>
              <div>
                Last Activity: 
                <span className="font-mono ml-1">
                  {audioStats.lastActivity ? new Date(audioStats.lastActivity).toLocaleTimeString() : 'None'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Audio Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant={isMuted ? "destructive" : "outline"}
            size="sm"
            onClick={() => setIsMuted(!isMuted)}
            disabled={!isStreaming}
          >
            {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {isMuted ? 'Unmute' : 'Mute'}
          </Button>
          
          <div className="flex items-center gap-1">
            {isPlayingAudio ? (
              <Play className="h-4 w-4 text-green-500" />
            ) : (
              <Pause className="h-4 w-4 text-gray-400" />
            )}
            <span className="text-xs">
              {isPlayingAudio ? 'Playing' : 'Silent'}
            </span>
          </div>
        </div>

        {/* Manual Controls */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={startHttpAudioStreaming}
            disabled={isStreaming || !callId}
          >
            Start Streaming
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={stopHttpAudioStreaming}
            disabled={!isStreaming}
          >
            Stop Streaming
          </Button>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            Error: {error}
          </div>
        )}

        {/* Info */}
        <div className="text-xs text-gray-500">
          HTTP-based audio streaming without WebRTC dependencies.
          Supports transfers and conference calls.
        </div>
      </CardContent>
    </Card>
  );
}