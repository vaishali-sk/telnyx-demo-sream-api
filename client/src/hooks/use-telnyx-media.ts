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
  isMuted: boolean;
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
    mediaFormat: null,
    isMuted: false
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-connect to WebSocket when hook initializes (moved after connectWebSocket definition)

  // Connect to Telnyx Media WebSocket server
  const connectWebSocket = useCallback(() => {
    console.log('🚀 connectWebSocket() called for callId:', callId);
    console.log('Current WebSocket state:', wsRef.current?.readyState);
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Construct WebSocket URL without tokens - use simple relative path approach
      const isHttps = window.location.protocol === "https:";
      const protocol = isHttps ? "wss:" : "ws:";
      
      // For Replit environment, use window.location.host directly but clean it
      let host = window.location.host;
      
      // Debug the original host value
      console.log('Raw window.location.host:', host);
      console.log('Raw window.location.hostname:', window.location.hostname);
      console.log('Raw window.location.port:', window.location.port);
      
      // Clean malformed host with tokens or authentication
      if (host.includes('token=') || host.includes('/?')) {
        // Extract clean domain:port part
        host = host.split('/?')[0].split('?')[0];
      }
      
      // If in Replit environment, construct proper URL
      if (host.includes('.replit.dev')) {
        // Use current domain with proper protocol
        const wsUrl = `${protocol}//${host}/ws/telnyx-media`;
        console.log('🔗 Using Replit domain for WebSocket:', wsUrl);
        wsRef.current = new WebSocket(wsUrl);
      } else {
        // Local development
        const wsUrl = `${protocol}//localhost:5000/ws/telnyx-media`;
        console.log('🔗 Using localhost for WebSocket:', wsUrl);
        wsRef.current = new WebSocket(wsUrl);
      }
      
      console.log('Original location:', window.location.href);
      console.log('Cleaned host:', host);
      console.log('WebSocket readyState before creation:', wsRef.current?.readyState);
      
      wsRef.current.onopen = () => {
        console.log('✅ Telnyx Media WebSocket connected successfully');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
      };
      
      wsRef.current.onclose = () => {
        console.log('Telnyx Media WebSocket disconnected');
        setState(prev => ({ ...prev, isConnected: false, isStreaming: false }));
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket connection error:', error);
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
        startAudioProcessing(result.streamId);

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
  const startAudioProcessing = useCallback((streamId: string) => {
    if (!analyserRef.current || !audioContextRef.current || !mediaStreamRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    // Create ScriptProcessor for real-time audio capture
    const scriptProcessor = audioContextRef.current.createScriptProcessor(1024, 1, 1);
    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    
    // Connect audio processing chain
    source.connect(analyserRef.current);
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioContextRef.current.destination);
    
    // Process audio data and send to Telnyx
    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      if (!state.isStreaming) return;
      
      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0);
      
      // Convert Float32Array to PCM and encode to base64
      const pcmData = new ArrayBuffer(inputData.length * 2);
      const pcmView = new DataView(pcmData);
      
      for (let i = 0; i < inputData.length; i++) {
        // Convert float to 16-bit PCM
        const sample = Math.max(-1, Math.min(1, inputData[i]));
        pcmView.setInt16(i * 2, sample * 0x7FFF, true);
      }
      
      // Convert to base64
      const uint8Array = new Uint8Array(pcmData);
      const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
      
      // Send audio data via WebSocket
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          event: 'media',
          stream_id: streamId,
          media: {
            payload: base64Audio
          }
        }));
      }
    };
    
    // Monitor audio levels
    const updateLevel = () => {
      if (!analyserRef.current || !state.isStreaming) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setState(prev => ({ ...prev, audioLevel: Math.round((average / 255) * 100) }));
    };

    // Monitor levels every 100ms
    recordingIntervalRef.current = setInterval(updateLevel, 100);

  }, [state.isStreaming, wsRef]);

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

  // Initialize media streaming when callId changes
  useEffect(() => {
    if (callId && state.isConnected) {
      console.log('Call ID available, ready for media streaming:', callId);
    }

    return () => {
      stopMediaStream();
    };
  }, [callId, state.isConnected, stopMediaStream]);

  // Auto-connect to WebSocket when hook initializes
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  return {
    ...state,
    startMediaStream,
    stopMediaStream,
    sendMediaMessage,
    sendDTMF,
    toggleMute: () => {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getAudioTracks().forEach(track => {
          track.enabled = !track.enabled;
        });
        setState(prev => ({ ...prev, isMuted: !prev.isMuted }));
      }
    },
    capabilities: {
      supportsTelnyxStreaming: true,
      supportedCodecs: ['PCMU', 'PCMA', 'G722', 'OPUS', 'AMR-WB'],
      supportedTracks: ['inbound_track', 'outbound_track', 'both_tracks'],
      bidirectionalSupport: true
    }
  };
}