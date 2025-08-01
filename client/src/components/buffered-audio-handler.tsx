import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, Volume2, VolumeX, Play, AlertCircle } from 'lucide-react';

interface BufferedAudioHandlerProps {
  callId: string | null;
  isCallActive: boolean;
}

export function BufferedAudioHandler({ callId, isCallActive }: BufferedAudioHandlerProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  
  // Audio buffering system for smooth RTP playback
  const audioQueue = useRef<Float32Array[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTime = useRef(0);

  // Initialize audio system
  const initializeAudio = useCallback(async () => {
    if (hasUserInteracted) return;
    
    try {
      // Create audio context with optimal settings for voice calls
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
      
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Get microphone access for outbound audio
      try {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 8000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        console.log('🎤 Microphone access granted');
      } catch (micError) {
        console.warn('Microphone access denied:', micError);
      }
      
      setHasUserInteracted(true);
      setError(null);
      console.log('✅ Enhanced audio system initialized');
      
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error);
      setError('Failed to initialize audio system');
    }
  }, [hasUserInteracted]);

  // Connect to WebSocket for bidirectional audio
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telnyx-media`;
      
      console.log('🔗 Connecting to enhanced audio WebSocket:', wsUrl);
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ Enhanced audio WebSocket connected');
        setIsConnected(true);
        setError(null);
        startMicrophoneCapture();
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (err) {
          console.error('Failed to parse audio message:', err);
        }
      };

      wsRef.current.onclose = () => {
        console.log('🔌 Enhanced audio WebSocket disconnected');
        setIsConnected(false);
        setIsStreaming(false);
        stopMicrophoneCapture();
      };

      wsRef.current.onerror = (error) => {
        console.error('Enhanced audio WebSocket error:', error);
        setError('Audio connection failed');
      };
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setError('Failed to connect to audio server');
    }
  }, []);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.event || message.type) {
      case 'connected':
        console.log('📡 Enhanced Telnyx media connected');
        break;
      
      case 'start':
        console.log('🎵 Enhanced media streaming started');
        setIsStreaming(true);
        break;
      
      case 'stop':
        console.log('🛑 Enhanced media streaming stopped');
        setIsStreaming(false);
        break;
      
      case 'media':
        if (message.media?.payload && hasUserInteracted) {
          queueIncomingAudio(message.media.payload);
        }
        break;

      case 'audio_data':
        if (message.payload && hasUserInteracted) {
          queueIncomingAudio(message.payload);
        }
        break;
      
      case 'error':
        console.error('❌ Enhanced Telnyx error:', message.error);
        setError(`Telnyx error: ${message.error?.title || 'Unknown error'}`);
        break;
    }
  }, [hasUserInteracted]);

  // Queue incoming audio for smooth playback
  const queueIncomingAudio = useCallback((audioData: string) => {
    if (!audioContextRef.current || !hasUserInteracted) return;

    try {
      // Decode base64 μ-law audio
      const buffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      if (buffer.length === 0) return;

      // Convert μ-law to linear PCM with improved algorithm
      const floatSamples = new Float32Array(buffer.length);
      
      for (let i = 0; i < buffer.length; i++) {
        let sample = buffer[i];
        sample = ~sample; // Complement
        const sign = (sample & 0x80) !== 0;
        let exponent = (sample >> 4) & 0x07;
        let mantissa = sample & 0x0F;
        
        // Enhanced μ-law decode with better precision
        mantissa = (mantissa << 1) + 33;
        let linearValue = mantissa << exponent;
        linearValue -= 33;
        
        if (sign) {
          linearValue = -linearValue;
        }
        
        // Scale to float range [-1, 1] with better dynamic range
        floatSamples[i] = Math.max(-1.0, Math.min(1.0, linearValue / 16384.0));
      }

      // Add to playback queue
      audioQueue.current.push(floatSamples);
      
      // Start continuous playback if not already playing
      if (!isPlayingRef.current) {
        startContinuousPlayback();
      }
      
      console.log(`🔊 Queued ${buffer.length} audio samples for smooth playback`);
      
    } catch (error) {
      console.error('Failed to queue audio:', error);
    }
  }, [hasUserInteracted]);

  // Continuous smooth audio playback
  const startContinuousPlayback = useCallback(() => {
    if (isPlayingRef.current || !audioContextRef.current) return;
    
    isPlayingRef.current = true;
    setIsPlaying(true);
    nextPlayTime.current = audioContextRef.current.currentTime;

    const scheduleNextBuffer = () => {
      if (!audioContextRef.current || audioQueue.current.length === 0) {
        isPlayingRef.current = false;
        setIsPlaying(false);
        return;
      }

      try {
        // Dequeue audio samples
        const samples = audioQueue.current.shift();
        if (!samples || samples.length === 0) {
          setTimeout(scheduleNextBuffer, 10);
          return;
        }

        // Create audio buffer at 8kHz (telephony standard)
        const audioBuffer = audioContextRef.current.createBuffer(1, samples.length, 8000);
        audioBuffer.copyToChannel(samples, 0);
        
        // Create enhanced audio processing chain
        const source = audioContextRef.current.createBufferSource();
        const gainNode = audioContextRef.current.createGain();
        const filterNode = audioContextRef.current.createBiquadFilter();
        const compressor = audioContextRef.current.createDynamicsCompressor();
        
        // Configure bandpass filter for voice clarity (300Hz - 3400Hz)
        filterNode.type = 'bandpass';
        filterNode.frequency.value = 1000; // Center frequency for voice
        filterNode.Q.value = 1.0;
        
        // Configure compressor for consistent audio levels
        compressor.threshold.value = -20;
        compressor.knee.value = 5;
        compressor.ratio.value = 8;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.1;
        
        source.buffer = audioBuffer;
        gainNode.gain.value = 1.8; // Boost for clear voice
        
        // Audio chain: source -> filter -> compressor -> gain -> output
        source.connect(filterNode);
        filterNode.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(audioContextRef.current.destination);
        
        // Schedule precise playback timing
        const playTime = Math.max(nextPlayTime.current, audioContextRef.current.currentTime);
        source.start(playTime);
        
        // Calculate next play time for gapless playback
        const duration = samples.length / 8000; // Duration in seconds
        nextPlayTime.current = playTime + duration;
        
        console.log(`🎵 Playing ${samples.length} samples (${(duration * 1000).toFixed(1)}ms)`);
        
        // Schedule next buffer immediately
        setTimeout(scheduleNextBuffer, 1);
        
      } catch (error) {
        console.error('Playback error:', error);
        isPlayingRef.current = false;
        setIsPlaying(false);
      }
    };

    scheduleNextBuffer();
  }, []);

  // Start microphone capture for outbound audio
  const startMicrophoneCapture = useCallback(() => {
    if (!micStreamRef.current || !audioContextRef.current || !wsRef.current) return;

    try {
      const source = audioContextRef.current.createMediaStreamSource(micStreamRef.current);
      const processor = audioContextRef.current.createScriptProcessor(1024, 1, 1);
      
      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState !== WebSocket.OPEN) return;
        
        const inputBuffer = event.inputBuffer.getChannelData(0);
        
        // Convert float samples to μ-law for Telnyx
        const mulawData = new Uint8Array(inputBuffer.length);
        for (let i = 0; i < inputBuffer.length; i++) {
          const sample = Math.max(-1, Math.min(1, inputBuffer[i]));
          const linear = Math.floor(sample * 32767);
          
          // Linear to μ-law conversion
          const sign = linear < 0 ? 0x80 : 0;
          const magnitude = Math.abs(linear);
          let exponent = 7;
          
          for (let exp = 0; exp < 8; exp++) {
            if (magnitude <= (33 << exp)) {
              exponent = exp;
              break;
            }
          }
          
          const mantissa = (magnitude >> exponent) & 0x0F;
          const mulaw = ~(sign | (exponent << 4) | mantissa);
          mulawData[i] = mulaw & 0xFF;
        }
        
        // Send to server as base64
        const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(mulawData)));
        wsRef.current.send(JSON.stringify({
          type: 'outbound_audio',
          payload: base64Audio,
          timestamp: Date.now()
        }));
      };
      
      source.connect(processor);
      processor.connect(audioContextRef.current.destination);
      
      console.log('🎤 Enhanced microphone capture started');
      
    } catch (error) {
      console.error('Failed to start microphone capture:', error);
    }
  }, []);

  // Stop microphone capture
  const stopMicrophoneCapture = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
      console.log('🎤 Microphone capture stopped');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopMicrophoneCapture();
      isPlayingRef.current = false;
      audioQueue.current = [];
    };
  }, [stopMicrophoneCapture]);

  // Auto-connect when call becomes active
  useEffect(() => {
    if (isCallActive && hasUserInteracted && !isConnected) {
      connectWebSocket();
    }
  }, [isCallActive, hasUserInteracted, isConnected, connectWebSocket]);

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="h-5 w-5" />
          Enhanced Audio Handler
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2">
          <Button 
            onClick={initializeAudio}
            disabled={hasUserInteracted}
            className="w-full"
          >
            {hasUserInteracted ? '✅ Audio Ready' : 'Initialize Enhanced Audio'}
          </Button>
          
          <Button 
            onClick={connectWebSocket}
            disabled={!hasUserInteracted || isConnected}
            variant="outline"
            className="w-full"
          >
            {isConnected ? '✅ Connected' : 'Connect Audio Stream'}
          </Button>
        </div>

        <div className="flex gap-2">
          <Badge variant={isConnected ? "default" : "secondary"}>
            {isConnected ? "Connected" : "Disconnected"}
          </Badge>
          <Badge variant={isStreaming ? "default" : "secondary"}>
            {isStreaming ? "Streaming" : "Idle"}
          </Badge>
          <Badge variant={isPlaying ? "default" : "secondary"}>
            {isPlaying ? "Playing" : "Silent"}
          </Badge>
        </div>

        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          <div>Queue: {audioQueue.current.length} buffers</div>
          <div>Status: {hasUserInteracted ? 'Ready' : 'Needs interaction'}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export default BufferedAudioHandler;