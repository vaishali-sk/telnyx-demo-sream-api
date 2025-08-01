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

  // Connect to Telnyx Media WebSocket server
  const connectWebSocket = useCallback(() => {
    console.log('🚀 connectWebSocket() called for callId:', callId);
    console.log('Current WebSocket state:', wsRef.current?.readyState);
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      // Construct WebSocket URL for Replit environment
      const isHttps = window.location.protocol === "https:";
      const protocol = isHttps ? "wss:" : "ws:";
      
      // Use current host for WebSocket connection
      let host = window.location.host;
      
      // Clean any URL params or fragments from host
      if (host.includes('?') || host.includes('#')) {
        host = host.split('?')[0].split('#')[0];
      }
      
      const wsUrl = `${protocol}//${host}/ws/telnyx-media`;
      console.log('🔗 Connecting to WebSocket:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ Telnyx Media WebSocket connected successfully');
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        // Send connected acknowledgment
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ event: 'connected', version: '1.0' }));
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('Telnyx Media WebSocket disconnected:', event.code, event.reason);
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
  }, [callId]);

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
          console.log('🔊 Received audio data, length:', message.media.payload.length);
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

  // Auto-connect to WebSocket when hook initializes
  useEffect(() => {
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch((error) => {
          console.warn('Audio context close error (can be ignored):', error);
        });
      }
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
    };
  }, [connectWebSocket]);

  const playIncomingAudio = useCallback(async (audioData: string) => {
    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        // Use higher sample rate for better audio quality
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000,
          latencyHint: 'interactive'
        });
        console.log('🎧 Audio context created with sample rate:', audioContextRef.current.sampleRate);
      }
        
      // Resume context if suspended (required for user interaction)
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('🔓 Audio context resumed');
        } catch (error) {
          console.warn('Audio context resume failed:', error);
        }
      }

      console.log('🎵 Playing incoming audio data, length:', audioData.length);
      
      // Decode base64 RTP payload
      const audioBuffer = Uint8Array.from(atob(audioData), c => c.charCodeAt(0));
      console.log('📊 Decoded audio buffer length:', audioBuffer.length);
      
      if (audioBuffer.length === 0) {
        console.warn('⚠️ Empty audio buffer received');
        return;
      }
      
      // Proper μ-law to linear PCM conversion for voice audio
      const pcmArray = new Int16Array(audioBuffer.length);
      
      for (let i = 0; i < audioBuffer.length; i++) {
        let sample = audioBuffer[i];
        
        // Standard μ-law decode algorithm
        sample = ~sample; // Bitwise NOT (complement)
        const sign = (sample & 0x80) !== 0;
        let exponent = (sample >> 4) & 0x07;
        let mantissa = sample & 0x0F;
        
        // Rebuild linear value using μ-law formula
        mantissa = (mantissa << 1) + 33;
        let linearValue = mantissa << exponent;
        linearValue -= 33;
        
        // Apply sign and scale properly
        if (sign) {
          linearValue = -linearValue;
        }
        
        // Scale to 16-bit range for better voice quality
        pcmArray[i] = Math.max(-32768, Math.min(32767, linearValue * 4));
      }

      // Convert to float array for Web Audio API
      const floatArray = new Float32Array(pcmArray.length);
      for (let i = 0; i < pcmArray.length; i++) {
        floatArray[i] = pcmArray[i] / 32768.0; // Normalize to [-1, 1]
      }

      // Create audio buffer with proper timing
      const sampleRate = 8000; // PCMU is always 8kHz
      const duration = floatArray.length / sampleRate;
      const audioBufferNode = audioContextRef.current.createBuffer(1, floatArray.length, sampleRate);
      audioBufferNode.copyToChannel(floatArray, 0);
      
      const source = audioContextRef.current.createBufferSource();
      source.buffer = audioBufferNode;
      
      // Create audio processing chain for clear voice
      const gainNode = audioContextRef.current.createGain();
      const filterNode = audioContextRef.current.createBiquadFilter();
      
      // Voice frequency filter (300Hz - 3400Hz bandpass)
      filterNode.type = 'bandpass';
      filterNode.frequency.value = 1200; // Better center frequency for voice clarity
      filterNode.Q.value = 0.7; // Lower Q for wider frequency range
      
      gainNode.gain.value = 1.8; // Balanced amplification for clarity
      
      // Connect: source -> filter -> gain -> output
      source.connect(filterNode);
      filterNode.connect(gainNode);
      gainNode.connect(audioContextRef.current.destination);
      
      source.start();
      
      console.log(`🔊 Voice audio played: ${duration.toFixed(3)}s, ${audioBuffer.length} μ-law samples`);
      
    } catch (error) {
      console.error('❌ Failed to play incoming audio:', error);
      setState(prev => ({ ...prev, error: `Audio playback failed: ${error}` }));
    }
  }, []);

  // Start streaming function for the button
  const startStream = useCallback(async (targetCallId?: string) => {
    const activeCallId = targetCallId || callId;
    if (!activeCallId) {
      setState(prev => ({ ...prev, error: 'No call ID provided' }));
      return;
    }
    
    console.log('Starting stream for call:', activeCallId);
    
    // Initialize audio context if needed
    if (!audioContextRef.current) {
      try {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log('Audio context initialized');
      } catch (error) {
        console.error('Failed to initialize audio context:', error);
        setState(prev => ({ ...prev, error: 'Failed to initialize audio' }));
        return;
      }
    }

    // Connect WebSocket if not connected
    if (!state.isConnected) {
      connectWebSocket();
    }
    
    setState(prev => ({ ...prev, isStreaming: true, error: null }));
  }, [callId, state.isConnected, connectWebSocket]);

  // Stop streaming function
  const stopStream = useCallback(() => {
    console.log('Stopping stream');
    setState(prev => ({ ...prev, isStreaming: false }));
    if (audioContextRef.current) {
      audioContextRef.current.suspend();
    }
  }, []);

  // Simplified media streaming - just manage WebSocket connection and audio
  const startMediaStream = useCallback(async (track: 'inbound_track' | 'outbound_track' | 'both_tracks' = 'both_tracks') => {
    if (!callId) {
      setState(prev => ({ ...prev, error: 'No call ID provided' }));
      return;
    }

    try {
      console.log('🎵 Starting media stream for call:', callId);
      setState(prev => ({ ...prev, error: null }));

      // Initialize audio context for playback (user interaction required)
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
          sampleRate: 48000,
          latencyHint: 'interactive'
        });
        console.log('🎧 Audio context initialized for playback');
      }

      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        try {
          await audioContextRef.current.resume();
          console.log('🔓 Audio context resumed');
        } catch (error) {
          console.warn('Audio context resume failed:', error);
        }
      }

      // Connect WebSocket if not connected
      if (!state.isConnected) {
        connectWebSocket();
      }

      // Set streaming state to true - Telnyx handles the actual streaming
      setState(prev => ({ 
        ...prev, 
        isStreaming: true,
        config: {
          streamUrl: `/ws/telnyx-media`,
          streamTrack: track,
          streamBidirectionalMode: 'rtp',
          streamBidirectionalCodec: 'PCMU'
        }
      }));

      console.log('✅ Media streaming enabled - Telnyx will handle the stream automatically');
      
    } catch (err) {
      const errorMsg = `Failed to initialize media streaming: ${err}`;
      setState(prev => ({ ...prev, error: errorMsg }));
      console.error(errorMsg);
    }
  }, [callId, state.isConnected, connectWebSocket]);

  // Stop media streaming
  const stopMediaStream = useCallback(async () => {
    try {
      console.log('🛑 Stopping media streaming');

      // Stop audio processing
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
      }

      // Don't close audio context, just suspend it for reuse
      if (audioContextRef.current && audioContextRef.current.state !== 'suspended') {
        await audioContextRef.current.suspend();
      }

      setState(prev => ({ 
        ...prev, 
        isStreaming: false,
        config: null,
        streamId: null,
        audioLevel: 0,
        mediaFormat: null
      }));

      console.log('✅ Media streaming stopped');
      
    } catch (err) {
      console.error('Failed to stop media stream:', err);
    }
  }, []);

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
    connectWebSocket,
    startStream,
    stopStream,
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