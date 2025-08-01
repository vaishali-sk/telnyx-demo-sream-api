import { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest } from '@/lib/queryClient';

interface TelnyxMediaConfig {
  streamUrl: string;
  streamTrack: 'inbound_track' | 'outbound_track' | 'both_tracks';
  streamBidirectionalMode?: 'rtp';
  streamBidirectionalCodec?: 'PCMU' | 'PCMA' | 'G722' | 'OPUS' | 'AMR-WB';
}

interface MediaFormat {
  encoding: string;
  sample_rate: number;
  channels: number;
}

interface TelnyxMediaState {
  isStreaming: boolean;
  isConnected: boolean;
  config: TelnyxMediaConfig | null;
  streamId: string | null;
  error: string | null;
  audioLevel: number;
  mediaFormat: MediaFormat | null;
}

interface MediaMessage {
  event: 'media' | 'start' | 'stop' | 'connected' | 'error' | 'dtmf' | 'mark' | 'clear';
  stream_id?: string;
  sequence_number?: string;
  media?: {
    track?: 'inbound' | 'outbound';
    chunk?: string;
    timestamp?: string;
    payload: string;
  };
  start?: {
    user_id: string;
    call_control_id: string;
    call_session_id: string;
    from: string;
    to: string;
    media_format: MediaFormat;
  };
  stop?: {
    user_id: string;
    call_control_id: string;
  };
  dtmf?: {
    digit: string;
  };
  mark?: {
    name: string;
  };
  error?: {
    code: number;
    title: string;
    detail: string;
  };
  version?: string;
}

export function useTelnyxMedia(callId?: string) {
  const [state, setState] = useState<TelnyxMediaState>({
    isStreaming: false,
    isConnected: false,
    config: null,
    streamId: null,
    error: null,
    audioLevel: 0,
    mediaFormat: null
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Connect to Telnyx Media WebSocket server
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws/telnyx-media`;
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('Telnyx Media WebSocket connected');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };
      
      wsRef.current.onclose = () => {
        console.log('Telnyx Media WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false, isStreaming: false }));
      };
      
      wsRef.current.onerror = () => {
        setState(prev => ({ ...prev, error: 'WebSocket connection failed', isConnected: false }));
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const message: MediaMessage = JSON.parse(event.data);
          handleIncomingMessage(message);
        } catch (err) {
          console.error('Failed to parse Telnyx media message:', err);
        }
      };
      
    } catch (err) {
      setState(prev => ({ ...prev, error: 'Failed to connect WebSocket' }));
      console.error('WebSocket connection error:', err);
    }
  }, []);

  const handleIncomingMessage = useCallback((message: MediaMessage) => {
    switch (message.event) {
      case 'connected':
        console.log('Telnyx Media WebSocket connected, version:', message.version);
        break;
      
      case 'start':
        if (message.start && message.stream_id) {
          setState(prev => ({ 
            ...prev, 
            isStreaming: true,
            streamId: message.stream_id!,
            mediaFormat: message.start!.media_format
          }));
          console.log('Media streaming started:', message.start);
        }
        break;
      
      case 'stop':
        setState(prev => ({ 
          ...prev, 
          isStreaming: false,
          streamId: null,
          mediaFormat: null
        }));
        console.log('Media streaming stopped');
        break;
      
      case 'media':
        // Handle incoming audio from remote party
        if (message.media?.payload) {
          playIncomingAudio(message.media.payload);
        }
        break;

      case 'dtmf':
        console.log('DTMF received:', message.dtmf?.digit);
        break;

      case 'error':
        const errorMsg = `Telnyx Media Error ${message.error?.code}: ${message.error?.title}`;
        setState(prev => ({ 
          ...prev, 
          error: errorMsg,
          isStreaming: false 
        }));
        console.error(errorMsg, message.error?.detail);
        break;

      case 'mark':
        console.log('Mark received:', message.mark?.name);
        break;
    }
  }, []);

  const playIncomingAudio = useCallback(async (audioData: string) => {
    if (!audioContextRef.current) return;

    try {
      // Decode base64 RTP payload
      const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      
      // For PCMU/PCMA, we need to decode the audio format properly
      // This is a simplified approach - in production you'd want proper codec handling
      const floatArray = new Float32Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        // Simple PCMU to linear PCM conversion (very basic)
        floatArray[i] = (audioBuffer[i] - 128) / 128.0;
      }

      // Create audio buffer
      const audioBufferNode = audioContextRef.current.createBuffer(1, floatArray.length, 8000);
      audioBufferNode.copyToChannel(floatArray, 0);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferNode;
      source.connect(audioContextRef.current.destination);
      source.start();
      
    } catch (error) {
      console.error('Failed to play incoming audio:', error);
    }
  }, []);

  // Start media streaming
  const startMediaStream = useCallback(async (track: 'inbound_track' | 'outbound_track' | 'both_tracks' = 'both_tracks') => {
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

      // Start media stream via API
      const response = await apiRequest('POST', `/api/calls/${callId}/start-media-stream`, {
        track,
        codec: 'PCMU'
      });

      const result = await response.json();
      
      if (result.success) {
        // Initialize audio context for microphone capture
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 8000
        });

        // Get microphone access
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 8000,
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

        // Start monitoring audio levels and sending audio data
        startAudioProcessing();

        setState(prev => ({ 
          ...prev, 
          config: {
            streamUrl: result.streamingUrl,
            streamTrack: track,
            streamBidirectionalMode: 'rtp',
            streamBidirectionalCodec: 'PCMU'
          }
        }));

        console.log('Telnyx media streaming started successfully');
      } else {
        throw new Error(result.message || 'Failed to start media stream');
      }
      
    } catch (err) {
      const errorMsg = `Failed to start media stream: ${err}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      console.error(errorMsg);
    }
  }, [callId, state.isConnected, connectWebSocket]);

  // Stop media streaming
  const stopMediaStream = useCallback(async () => {
    if (!callId) return;

    try {
      // Stop audio processing
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }

      // Stop media stream via API
      await apiRequest('POST', `/api/calls/${callId}/stop-media-stream`);

      setState(prev => ({ 
        ...prev, 
        isStreaming: false,
        config: null,
        streamId: null,
        audioLevel: 0,
        mediaFormat: null
      }));

      console.log('Telnyx media streaming stopped');
      
    } catch (err) {
      setState(prev => ({ ...prev, error: `Failed to stop media stream: ${err}` }));
      console.error('Failed to stop media stream:', err);
    }
  }, [callId]);

  // Start audio processing (recording and level monitoring)
  const startAudioProcessing = useCallback(() => {
    if (!analyserRef.current || !audioContextRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    const audioBuffer = new Float32Array(1024); // Small buffer for real-time processing
    
    // Monitor audio levels
    const updateLevel = () => {
      if (!analyserRef.current || !state.isStreaming) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setState(prev => ({ ...prev, audioLevel: Math.round((average / 255) * 100) }));
    };

    // Send audio data periodically (every 20ms for real-time streaming)
    recordingIntervalRef.current = setInterval(() => {
      if (!audioContextRef.current || !state.isStreaming) return;
      
      // In a real implementation, you'd capture actual audio data here
      // For now, we'll send a placeholder to demonstrate the flow
      updateLevel();
      
      // Note: Real audio capture would require more complex processing
      // This is simplified for demonstration
    }, 20);

  }, [state.isStreaming]);

  // Send media message via WebSocket
  const sendMediaMessage = useCallback((audioData: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'media',
        media: {
          payload: audioData
        }
      }));
    }
  }, []);

  // Send DTMF via WebSocket
  const sendDTMF = useCallback((digit: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        event: 'dtmf',
        dtmf: { digit }
      }));
    }
  }, []);

  // Initialize WebSocket connection
  useEffect(() => {
    if (callId) {
      connectWebSocket();
    }

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      stopMediaStream();
    };
  }, [callId, connectWebSocket, stopMediaStream]);

  return {
    ...state,
    startMediaStream,
    stopMediaStream,
    sendMediaMessage,
    sendDTMF,
    capabilities: {
      supportsTelnyxStreaming: true,
      supportedCodecs: ['PCMU', 'PCMA', 'G722', 'OPUS', 'AMR-WB'],
      supportedTracks: ['inbound_track', 'outbound_track', 'both_tracks'],
      bidirectionalSupport: true
    }
  };
}