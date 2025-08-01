import { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface RTPMediaConfig {
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  codec: 'PCMU' | 'PCMA' | 'G729' | 'G722';
  sampleRate: number;
}

interface RTPMediaState {
  isStreaming: boolean;
  isConnected: boolean;
  config: RTPMediaConfig | null;
  error: string | null;
  audioLevel: number;
}

export function useRTPMedia(callId?: string) {
  const [state, setState] = useState<RTPMediaState>({
    isStreaming: false,
    isConnected: false,
    config: null,
    error: null,
    audioLevel: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // Connect to RTP WebSocket server
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/rtp-media`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('RTP Media WebSocket connected');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };
      
      wsRef.current.onclose = () => {
        console.log('RTP Media WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false, isStreaming: false }));
      };
      
      wsRef.current.onerror = () => {
        setState(prev => ({ ...prev, error: 'WebSocket connection failed', isConnected: false }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleIncomingMessage(message);
        } catch (err) {
          console.error('Failed to parse RTP message:', err);
        }
      };
      
    } catch (err) {
      setState(prev => ({ ...prev, error: 'Failed to connect WebSocket' }));
      console.error('WebSocket connection error:', err);
    }
  }, []);

  const handleIncomingMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'rtp_stream_started':
        setState(prev => ({ 
          ...prev, 
          isStreaming: true,
          config: {
            localPort: message.localPort,
            codec: message.codec,
            sampleRate: message.sampleRate,
            remoteHost: message.remoteHost,
            remotePort: message.remotePort
          }
        }));
        break;
      
      case 'rtp_stream_stopped':
        setState(prev => ({ 
          ...prev, 
          isStreaming: false,
          config: null 
        }));
        break;
      
      case 'incoming_audio':
        // Handle incoming audio from remote party
        playIncomingAudio(message.audioData);
        break;

      case 'rtp_error':
        setState(prev => ({ 
          ...prev, 
          error: message.error,
          isStreaming: false 
        }));
        break;
    }
  }, []);

  const playIncomingAudio = useCallback(async (audioData: string) => {
    if (!audioContextRef.current) return;

    try {
      // Decode base64 audio data
      const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      
      // Convert to AudioBuffer and play
      const audioArrayBuffer = audioBuffer.buffer;
      const decodedAudio = await audioContextRef.current.decodeAudioData(audioArrayBuffer);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = decodedAudio;
      source.connect(audioContextRef.current.destination);
      source.start();
      
    } catch (error) {
      console.error('Failed to play incoming audio:', error);
    }
  }, []);

  // Start RTP streaming
  const startRTPStream = useCallback(async (config?: Partial<RTPMediaConfig>) => {
    if (!callId) {
      setState(prev => ({ ...prev, error: 'No call ID provided' }));
      return;
    }

    try {
      setState(prev => ({ ...prev, error: null }));

      // Connect WebSocket if not connected
      if (!state.isConnected) {
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

      // Start RTP stream via API
      const response = await apiRequest('POST', `/api/calls/${callId}/start-rtp-stream`, {
        localPort: config?.localPort || 5004,
        codec: config?.codec || 'PCMU',
        sampleRate: config?.sampleRate || 8000,
        remoteHost: config?.remoteHost,
        remotePort: config?.remotePort
      });

      const result = await response.json();
      
      if (result.success) {
        // Initialize audio context for microphone capture
        audioContextRef.current = new (window.AudioContext || (window.webkitAudioContext as any))({
          sampleRate: config?.sampleRate || 8000
        });

        // Get microphone access
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: config?.sampleRate || 8000,
            channelCount: 1,
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

        // Start monitoring audio levels
        monitorAudioLevel();

        // Send WebSocket message to start streaming
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({
            type: 'start_rtp_stream',
            callId,
            config: result.config
          }));
        }

        console.log('RTP streaming started successfully');
      } else {
        throw new Error(result.message || 'Failed to start RTP stream');
      }
      
    } catch (err) {
      const errorMsg = `Failed to start RTP stream: ${err}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      console.error(errorMsg);
    }
  }, [callId, state.isConnected, connectWebSocket]);

  // Stop RTP streaming
  const stopRTPStream = useCallback(async () => {
    if (!callId) return;

    try {
      // Stop audio processing
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Stop RTP stream via API
      await apiRequest('POST', `/api/calls/${callId}/stop-rtp-stream`);

      // Send WebSocket message to stop streaming
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'stop_rtp_stream',
          callId
        }));
      }

      setState(prev => ({ 
        ...prev, 
        isStreaming: false,
        config: null,
        audioLevel: 0 
      }));

      console.log('RTP streaming stopped');
      
    } catch (err) {
      setState(prev => ({ ...prev, error: `Failed to stop RTP stream: ${err}` }));
      console.error('Failed to stop RTP stream:', err);
    }
  }, [callId]);

  // Monitor audio levels
  const monitorAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const updateLevel = () => {
      if (!analyserRef.current || !state.isStreaming) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setState(prev => ({ ...prev, audioLevel: Math.round((average / 255) * 100) }));
      
      requestAnimationFrame(updateLevel);
    };
    
    updateLevel();
  }, [state.isStreaming]);

  // Send audio data via WebSocket
  const sendAudioData = useCallback((audioData: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && callId) {
      wsRef.current.send(JSON.stringify({
        type: 'audio_data',
        callId,
        audioData
      }));
    }
  }, [callId]);

  // Initialize WebSocket connection
  useEffect(() => {
    if (callId) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopRTPStream();
    };
  }, [callId, connectWebSocket, stopRTPStream]);

  return {
    ...state,
    startRTPStream,
    stopRTPStream,
    sendAudioData,
    capabilities: {
      supportsRTP: true,
      supportedCodecs: ['PCMU', 'PCMA', 'G722', 'G729'],
      supportedSampleRates: [8000, 16000, 48000]
    }
  };
}