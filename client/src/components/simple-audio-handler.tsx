import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Mic, 
  MicOff, 
  Volume2,
  VolumeX,
  Play,
  Pause,
  AlertCircle
} from 'lucide-react';

interface SimpleAudioProps {
  callId?: string;
  isCallActive: boolean;
}

export function SimpleAudioHandler({ callId, isCallActive }: SimpleAudioProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Audio buffering for smooth RTP packet playback
  const audioBufferRef = useRef<Float32Array[]>([]);
  const bufferSizeRef = useRef(0);
  const playbackTimerRef = useRef<number | null>(null);
  const targetBufferSize = 4096; // Target buffer size for smooth playback

  // Initialize audio context with user interaction
  const initializeAudio = useCallback(async () => {
    if (hasUserInteracted) return;
    
    try {
      // Create audio context - this requires user interaction
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 48000,
        latencyHint: 'interactive'
      });
      
      // Resume immediately after creation
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }
      
      setHasUserInteracted(true);
      setError(null);
      console.log('✅ Audio context initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize audio:', error);
      setError('Failed to initialize audio system');
    }
  }, [hasUserInteracted]);

  // Connect to WebSocket for audio streaming
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/telnyx-media`;
      
      console.log('🔗 Connecting to:', wsUrl);
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ Audio WebSocket connected');
        setIsConnected(true);
        setError(null);
      };
      
      wsRef.current.onclose = () => {
        console.log('🔌 Audio WebSocket disconnected');
        setIsConnected(false);
        setIsStreaming(false);
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setError('WebSocket connection failed');
        setIsConnected(false);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };
      
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setError('Failed to connect to audio server');
    }
  }, []);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.event) {
      case 'connected':
        console.log('📡 Telnyx media connected');
        break;
      
      case 'start':
        console.log('🎵 Media streaming started');
        setIsStreaming(true);
        break;
      
      case 'stop':
        console.log('🛑 Media streaming stopped');
        setIsStreaming(false);
        break;
      
      case 'media':
        if (message.media?.payload && hasUserInteracted) {
          playAudioData(message.media.payload);
        }
        break;
      
      case 'error':
        console.error('❌ Telnyx error:', message.error);
        setError(`Telnyx error: ${message.error?.title || 'Unknown error'}`);
        break;
    }
  }, [hasUserInteracted]);

  // Play incoming audio data
  const playAudioData = useCallback(async (audioData: string) => {
    if (!audioContextRef.current || !hasUserInteracted) {
      console.warn('⚠️ Audio context not ready');
      return;
    }

    try {
      // Resume context if needed
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      // Decode base64 audio data
      const buffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      
      if (buffer.length === 0) return;

      // Improved μ-law to linear PCM conversion for better voice quality
      const pcmArray = new Int16Array(buffer.length);
      
      for (let i = 0; i < buffer.length; i++) {
        let sample = buffer[i];
        
        // μ-law decode algorithm
        sample = ~sample; // Complement
        const sign = (sample & 0x80) !== 0;
        let exponent = (sample >> 4) & 0x07;
        let mantissa = sample & 0x0F;
        
        // Calculate linear value with proper μ-law formula
        mantissa = (mantissa << 1) + 33;
        let linearValue = mantissa << exponent;
        linearValue -= 33;
        
        // Apply sign and scale to 16-bit range
        if (sign) {
          linearValue = -linearValue;
        }
        
        // Scale from μ-law range to 16-bit PCM range with better scaling
        pcmArray[i] = Math.max(-32768, Math.min(32767, linearValue * 2));
      }

      // Convert to float array for Web Audio API
      const floatArray = new Float32Array(pcmArray.length);
      for (let i = 0; i < pcmArray.length; i++) {
        floatArray[i] = pcmArray[i] / 32768.0; // Normalize to [-1, 1]
      }

      // Create audio buffer with proper sample rate for voice
      const audioBuffer = audioContextRef.current.createBuffer(1, floatArray.length, 8000);
      audioBuffer.copyToChannel(floatArray, 0);
      
      // Create audio processing chain for clear voice playback
      const source = audioContextRef.current.createBufferSource();
      const gainNode = audioContextRef.current.createGain();
      const filterNode = audioContextRef.current.createBiquadFilter();
      
      // Configure filter for voice frequencies (300Hz - 3400Hz)
      filterNode.type = 'bandpass';
      filterNode.frequency.value = 1200; // Better center frequency for voice clarity
      filterNode.Q.value = 0.7; // Lower Q for wider frequency range
      
      source.buffer = audioBuffer;
      gainNode.gain.value = 1.5; // Reduced amplification to avoid distortion
      
      // Connect audio chain: source -> filter -> gain -> output
      source.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      source.start();
      
      // Calculate actual audio level from PCM data
      let sum = 0;
      for (let i = 0; i < floatArray.length; i++) {
        sum += Math.abs(floatArray[i]);
      }
      const avgLevel = (sum / floatArray.length) * 100;
      setAudioLevel(Math.min(100, avgLevel));
      
      // Reset level after audio duration
      const duration = floatArray.length / 8000 * 1000; // Convert to ms
      setTimeout(() => setAudioLevel(0), duration + 100);
      
      console.log(`🔊 Voice audio played: ${(duration/1000).toFixed(3)}s, ${buffer.length} μ-law samples`);
      
    } catch (error) {
      console.error('❌ Audio playback failed:', error);
    }
  }, [hasUserInteracted]);

  // Start audio streaming with microphone capture
  const startAudioStream = useCallback(async () => {
    if (!hasUserInteracted) {
      await initializeAudio();
    }
    
    if (!isConnected) {
      connectWebSocket();
    }
    
    try {
      // Get microphone access for transmitting audio
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 8000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Set up microphone audio processing
      if (audioContextRef.current) {
        const source = audioContextRef.current.createMediaStreamSource(stream);
        const processor = audioContextRef.current.createScriptProcessor(1024, 1, 1);
        
        processor.onaudioprocess = (event) => {
          if (!isStreaming) return;
          
          const inputData = event.inputBuffer.getChannelData(0);
          
          // Convert to μ-law for transmission
          const buffer = new ArrayBuffer(inputData.length);
          const view = new Uint8Array(buffer);
          
          for (let i = 0; i < inputData.length; i++) {
            // Convert float to 16-bit PCM
            let sample = Math.max(-1, Math.min(1, inputData[i]));
            let pcm = Math.round(sample * 32767);
            
            // Convert to μ-law
            const sign = pcm < 0 ? 0x80 : 0x00;
            if (pcm < 0) pcm = -pcm;
            
            let exponent = 7;
            let expMask = 0x4000;
            for (let exp = 0; exp < 8; exp++) {
              if (pcm <= expMask) {
                exponent = exp;
                break;
              }
              expMask <<= 1;
            }
            
            const mantissa = (pcm >> (exponent + 3)) & 0x0F;
            const mulaw = ~(sign | (exponent << 4) | mantissa);
            view[i] = mulaw & 0xFF;
          }
          
          // Send microphone audio to other party via WebSocket
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(view)));
            wsRef.current.send(JSON.stringify({
              type: 'outbound_audio',
              payload: base64Audio,
              timestamp: Date.now()
            }));
          }
        };
        
        source.connect(processor);
        processor.connect(audioContextRef.current.destination);
        
        console.log('🎤 Microphone enabled for transmission');
      }
      
    } catch (error) {
      console.error('Failed to access microphone:', error);
      setError('Microphone access required for two-way audio');
    }
    
    console.log('🎵 Starting audio stream for call:', callId);
    setIsStreaming(true);
  }, [hasUserInteracted, isConnected, callId, initializeAudio, connectWebSocket, isStreaming]);

  // Stop audio streaming
  const stopAudioStream = useCallback(() => {
    console.log('🛑 Stopping audio stream');
    setIsStreaming(false);
    setAudioLevel(0);
  }, []);

  // Auto-connect when call becomes active
  useEffect(() => {
    if (isCallActive && callId && !isConnected) {
      connectWebSocket();
    }
  }, [isCallActive, callId, isConnected, connectWebSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {
          // Ignore close errors
        });
      }
    };
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Volume2 className="w-5 h-5" />
          Audio Streaming
          <Badge variant={isConnected ? 'default' : 'secondary'}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* User Interaction Required */}
        {!hasUserInteracted && (
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 mb-3">
              Click below to enable audio (required by browser)
            </p>
            <Button onClick={initializeAudio} className="w-full">
              <Volume2 className="w-4 h-4 mr-2" />
              Enable Audio
            </Button>
          </div>
        )}

        {/* Audio Controls */}
        {hasUserInteracted && isCallActive && callId && (
          <div className="space-y-3">
            <div className="flex gap-2">
              {!isStreaming ? (
                <Button 
                  onClick={startAudioStream}
                  disabled={!isConnected}
                  className="flex-1"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Audio
                </Button>
              ) : (
                <Button 
                  onClick={stopAudioStream}
                  variant="destructive"
                  className="flex-1"
                >
                  <Pause className="w-4 h-4 mr-2" />
                  Stop Audio
                </Button>
              )}
            </div>

            {/* Audio Level */}
            {isStreaming && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Audio Level</span>
                  <span>{audioLevel}%</span>
                </div>
                <Progress value={audioLevel} className="w-full" />
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!isCallActive && (
          <div className="text-center text-sm text-muted-foreground py-4">
            Start a call to enable audio streaming
          </div>
        )}

        {/* Connection Status */}
        <div className="text-xs text-center text-muted-foreground">
          Status: {isConnected ? '🟢 Connected' : '🔴 Disconnected'} 
          {isStreaming && ' • 🎵 Streaming'}
        </div>
      </CardContent>
    </Card>
  );
}