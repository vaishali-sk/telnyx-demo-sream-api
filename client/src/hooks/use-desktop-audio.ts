import { useState, useEffect, useRef, useCallback } from 'react';

interface AudioStreamConfig {
  sampleRate: number;
  channels: number;
  bufferSize: number;
}

interface DesktopAudioHook {
  isConnected: boolean;
  isStreaming: boolean;
  audioLevel: number;
  startAudioStream: (callId: string) => Promise<void>;
  stopAudioStream: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  error: string | null;
}

export function useDesktopAudio(config: AudioStreamConfig = {
  sampleRate: 8000,
  channels: 1,
  bufferSize: 1024
}): DesktopAudioHook {
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Connect to WebSocket audio server
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/audio`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('Desktop audio WebSocket connected');
        setIsConnected(true);
        setError(null);
      };
      
      wsRef.current.onclose = () => {
        console.log('Desktop audio WebSocket disconnected');
        setIsConnected(false);
        setIsStreaming(false);
      };
      
      wsRef.current.onerror = () => {
        setError('WebSocket connection failed');
        setIsConnected(false);
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleIncomingMessage(message);
        } catch (err) {
          console.error('Failed to parse audio message:', err);
        }
      };
      
    } catch (err) {
      setError('Failed to connect WebSocket');
      console.error('WebSocket connection error:', err);
    }
  }, []);

  const handleIncomingMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'connected':
        console.log('Audio streaming ready');
        break;
      
      case 'stream_started':
        setIsStreaming(true);
        break;
      
      case 'stream_stopped':
        setIsStreaming(false);
        break;
      
      case 'audio_data':
        // Handle incoming audio from remote party
        playIncomingAudio(message.audioData);
        break;
    }
  }, []);

  const playIncomingAudio = useCallback(async (audioData: string) => {
    // In a real Electron app, this would decode and play audio through speakers
    // For now, we just log that audio was received
    console.log('Received audio data for playback:', audioData.length, 'bytes');
    
    // TODO: Implement actual audio playback for Electron
    // This would involve:
    // 1. Decoding base64 audio data
    // 2. Converting to PCM audio
    // 3. Playing through system speakers
  }, []);

  const startAudioStream = useCallback(async (callId: string) => {
    try {
      setError(null);
      
      // Connect WebSocket if not connected
      if (!isConnected) {
        connectWebSocket();
        // Wait for connection
        await new Promise((resolve, reject) => {
          const checkConnection = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              resolve(true);
            } else if (wsRef.current?.readyState === WebSocket.CLOSED) {
              reject(new Error('WebSocket connection failed'));
            } else {
              setTimeout(checkConnection, 100);
            }
          };
          checkConnection();
        });
      }

      // Set up audio context for microphone capture
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: config.sampleRate
      });

      // Get microphone access
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: config.sampleRate,
          channelCount: config.channels,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      // Set up audio processing
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      
      // Audio level monitoring
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      // Audio processing for streaming
      processorRef.current = audioContextRef.current.createScriptProcessor(config.bufferSize, config.channels, config.channels);
      
      processorRef.current.onaudioprocess = (event) => {
        if (!isStreaming || isMuted) return;

        const inputBuffer = event.inputBuffer;
        const audioData = inputBuffer.getChannelData(0);
        
        // Convert float32 audio to base64 for transmission
        const int16Array = new Int16Array(audioData.length);
        for (let i = 0; i < audioData.length; i++) {
          int16Array[i] = Math.max(-1, Math.min(1, audioData[i])) * 0x7FFF;
        }
        
        const audioBase64 = btoa(String.fromCharCode(...new Uint8Array(int16Array.buffer)));
        
        // Send audio data via WebSocket
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'audio_data',
            callId,
            direction: 'outbound',
            audioData: audioBase64
          }));
        }
      };

      source.connect(processorRef.current);
      processorRef.current.connect(audioContextRef.current.destination);

      // Start monitoring audio levels
      monitorAudioLevel();

      // Notify server to start streaming
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'start_stream',
          callId
        }));
      }

      console.log('Desktop audio streaming started for call:', callId);
      
    } catch (err) {
      setError(`Failed to start audio: ${err}`);
      console.error('Audio stream start error:', err);
    }
  }, [isConnected, isStreaming, isMuted, config, connectWebSocket]);

  const stopAudioStream = useCallback(() => {
    // Stop audio processing
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }

    // Stop microphone
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    // Notify server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stop_stream'
      }));
    }

    setIsStreaming(false);
    setAudioLevel(0);
    console.log('Desktop audio streaming stopped');
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(prev => !prev);
    
    // Mute/unmute microphone track
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMuted; // Will be opposite due to toggle
      });
    }
  }, [isMuted]);

  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current || !isStreaming) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const updateLevel = () => {
      if (!analyserRef.current || !isStreaming) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setAudioLevel(Math.round((average / 255) * 100));
      
      requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  }, [isStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAudioStream();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [stopAudioStream]);

  return {
    isConnected,
    isStreaming,
    audioLevel,
    startAudioStream,
    stopAudioStream,
    toggleMute,
    isMuted,
    error
  };
}