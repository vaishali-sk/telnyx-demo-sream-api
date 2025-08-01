import { useState, useCallback, useRef, useEffect } from 'react';

interface ElectronAudioConfig {
  sampleRate: number;
  channels: number;
  bufferSize: number;
}

interface ElectronAudioState {
  isReady: boolean;
  isMicMuted: boolean;
  isSpeakerMuted: boolean;
  micLevel: number;
  speakerLevel: number;
  error: string | null;
  devices: {
    microphone: string;
    speaker: string;
  };
}

export function useElectronAudio(callId?: string) {
  const [state, setState] = useState<ElectronAudioState>({
    isReady: false,
    isMicMuted: false,
    isSpeakerMuted: false,
    micLevel: 0,
    speakerLevel: 0,
    error: null,
    devices: {
      microphone: 'Default',
      speaker: 'Default'
    }
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const speakerAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  
  const config: ElectronAudioConfig = {
    sampleRate: 48000,
    channels: 1,
    bufferSize: 1024
  };

  // Check if running in Electron
  const isElectron = typeof window !== 'undefined' && 
                     typeof window.process !== 'undefined' && 
                     (window as any).process.type === 'renderer';

  const initializeAudio = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: config.sampleRate
      });

      // Get available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(d => d.kind === 'audioinput');
      const audioOutputs = devices.filter(d => d.kind === 'audiooutput');

      console.log('Audio devices found:', {
        inputs: audioInputs.length,
        outputs: audioOutputs.length,
        electron: isElectron
      });

      // Get microphone access
      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: config.sampleRate,
          channelCount: config.channels,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // Set up audio processing
      const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
      
      // Microphone analyzer for level monitoring
      micAnalyserRef.current = audioContextRef.current.createAnalyser();
      micAnalyserRef.current.fftSize = 256;
      source.connect(micAnalyserRef.current);

      // Audio processor for Telnyx integration
      audioProcessorRef.current = audioContextRef.current.createScriptProcessor(
        config.bufferSize, 
        config.channels, 
        config.channels
      );

      // Connect audio chain
      source.connect(audioProcessorRef.current);
      
      // In Electron, this would connect to native audio output
      if (isElectron) {
        // Electron-specific audio routing would go here
        console.log('Setting up Electron native audio routing');
      } else {
        // Browser fallback - connect to destination for testing
        audioProcessorRef.current.connect(audioContextRef.current.destination);
      }

      // Audio processing callback
      audioProcessorRef.current.onaudioprocess = (event) => {
        if (callId) {
          // Process audio data for Telnyx
          const inputBuffer = event.inputBuffer.getChannelData(0);
          
          // In a real implementation, this would:
          // 1. Send microphone data to Telnyx Call Control API
          // 2. Receive audio from Telnyx
          // 3. Route received audio to speakers
          
          console.log('Processing audio frame:', inputBuffer.length, 'samples');
        }
      };

      // Start monitoring audio levels
      startAudioMonitoring();

      setState(prev => ({
        ...prev,
        isReady: true,
        devices: {
          microphone: audioInputs[0]?.label || 'Default Microphone',
          speaker: audioOutputs[0]?.label || 'Default Speaker'
        }
      }));

      console.log('Electron audio system initialized successfully');

    } catch (error) {
      const errorMsg = `Audio initialization failed: ${error}`;
      setState(prev => ({ ...prev, error: errorMsg, isReady: false }));
      console.error(errorMsg);
    }
  }, [callId, isElectron]);

  const startAudioMonitoring = useCallback(() => {
    if (!micAnalyserRef.current) return;

    const dataArray = new Uint8Array(micAnalyserRef.current.frequencyBinCount);
    
    const updateLevels = () => {
      if (!micAnalyserRef.current || !state.isReady) return;
      
      // Get microphone level
      micAnalyserRef.current.getByteFrequencyData(dataArray);
      const micAverage = dataArray.reduce((a, b) => a + b) / dataArray.length;
      const micLevel = Math.round((micAverage / 255) * 100);
      
      // Speaker level would come from Telnyx audio stream
      const speakerLevel = Math.random() * 40; // Placeholder
      
      setState(prev => ({
        ...prev,
        micLevel: prev.isMicMuted ? 0 : micLevel,
        speakerLevel: prev.isSpeakerMuted ? 0 : speakerLevel
      }));
      
      requestAnimationFrame(updateLevels);
    };
    
    updateLevels();
  }, [state.isReady, state.isMicMuted, state.isSpeakerMuted]);

  const toggleMicrophone = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = state.isMicMuted; // Toggle
      });
    }
    
    setState(prev => ({ ...prev, isMicMuted: !prev.isMicMuted }));
    console.log('Microphone toggled:', !state.isMicMuted);
  }, [state.isMicMuted]);

  const toggleSpeaker = useCallback(() => {
    // In Electron, this would control system audio output
    setState(prev => ({ ...prev, isSpeakerMuted: !prev.isSpeakerMuted }));
    console.log('Speaker toggled:', !state.isSpeakerMuted);
    
    if (isElectron) {
      // Electron-specific speaker control would go here
      console.log('Controlling Electron speaker mute state');
    }
  }, [state.isSpeakerMuted, isElectron]);

  const cleanup = useCallback(() => {
    // Stop all audio processing
    if (audioProcessorRef.current) {
      audioProcessorRef.current.disconnect();
      audioProcessorRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setState(prev => ({
      ...prev,
      isReady: false,
      micLevel: 0,
      speakerLevel: 0
    }));

    console.log('Electron audio system cleaned up');
  }, []);

  // Initialize when call becomes active
  useEffect(() => {
    if (callId) {
      initializeAudio();
    } else {
      cleanup();
    }

    return cleanup;
  }, [callId, initializeAudio, cleanup]);

  return {
    ...state,
    isElectron,
    toggleMicrophone,
    toggleSpeaker,
    initializeAudio,
    cleanup
  };
}