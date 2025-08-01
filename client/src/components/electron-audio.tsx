import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mic, MicOff, Headphones, Activity, Volume2, VolumeX, Info } from "lucide-react";

interface ElectronAudioProps {
  callId?: string;
  isCallActive: boolean;
  onAudioReady: (ready: boolean) => void;
}

export function ElectronAudioStreaming({ callId, isCallActive, onAudioReady }: ElectronAudioProps) {
  const [isAudioReady, setIsAudioReady] = useState(false);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [speakerLevel, setSpeakerLevel] = useState(0);
  const [audioDevices, setAudioDevices] = useState<{ mic: string; speaker: string }>({ mic: 'Default', speaker: 'Default' });
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);

  // Check if running in Electron environment
  const isElectron = typeof window !== 'undefined' && window.process && (window as any).process.type;

  useEffect(() => {
    if (isCallActive && callId) {
      initializeAudio();
    } else {
      cleanupAudio();
    }

    return () => cleanupAudio();
  }, [isCallActive, callId]);

  const initializeAudio = async () => {
    try {
      setError(null);
      
      if (isElectron) {
        // Use Electron's native audio APIs
        await initializeElectronAudio();
      } else {
        // Fallback for web browser testing
        await initializeBrowserAudio();
      }
      
      setIsAudioReady(true);
      onAudioReady(true);
      
    } catch (err) {
      const errorMsg = `Failed to initialize audio: ${err}`;
      setError(errorMsg);
      console.error(errorMsg);
      onAudioReady(false);
    }
  };

  const initializeElectronAudio = async () => {
    // In a real Electron app, this would use:
    // - navigator.mediaDevices.getUserMedia() for microphone
    // - Web Audio API for processing
    // - Electron's native audio routing for system speakers
    
    console.log('Initializing Electron native audio for call:', callId);
    
    // Get audio devices list
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
    
    console.log('Available audio devices:', { inputs: audioInputs.length, outputs: audioOutputs.length });

    // Set up audio context
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Get microphone stream
    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      }
    });

    // Set up microphone analyzer
    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    analyserRef.current = audioContextRef.current.createAnalyser();
    analyserRef.current.fftSize = 256;
    source.connect(analyserRef.current);

    // Set up speaker output analyzer
    outputAnalyserRef.current = audioContextRef.current.createAnalyser();
    outputAnalyserRef.current.fftSize = 256;
    
    // Start monitoring audio levels
    monitorAudioLevels();
    
    // In Electron, we would connect to Telnyx audio streams here
    console.log('Electron audio initialized - ready for Telnyx integration');
  };

  const initializeBrowserAudio = async () => {
    // Simplified browser version for testing
    console.log('Initializing browser audio fallback');
    
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({
      audio: true
    });

    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    analyserRef.current = audioContextRef.current.createAnalyser();
    source.connect(analyserRef.current);
    
    monitorAudioLevels();
  };

  const monitorAudioLevels = () => {
    if (!analyserRef.current) return;

    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
    
    const updateLevels = () => {
      if (!analyserRef.current || !isAudioReady) return;
      
      // Monitor microphone level
      analyserRef.current.getByteFrequencyData(dataArray);
      const micAverage = dataArray.reduce((a, b) => a + b) / dataArray.length;
      setMicLevel(Math.round((micAverage / 255) * 100));
      
      // Monitor speaker level (would be from Telnyx audio stream)
      setSpeakerLevel(Math.random() * 30); // Placeholder - in real app this comes from Telnyx
      
      requestAnimationFrame(updateLevels);
    };
    
    updateLevels();
  };

  const cleanupAudio = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setIsAudioReady(false);
    setMicLevel(0);
    setSpeakerLevel(0);
    onAudioReady(false);
  };

  const toggleMicrophone = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = isMicMuted; // Will be opposite due to toggle
      });
    }
    setIsMicMuted(!isMicMuted);
  };

  const toggleSpeaker = () => {
    // In Electron, this would control system speaker volume/mute
    setIsSpeakerMuted(!isSpeakerMuted);
    console.log('Speaker mute toggled:', !isSpeakerMuted);
  };

  const getConnectionBadge = () => {
    if (error) return <Badge variant="destructive">Error</Badge>;
    if (isAudioReady) return <Badge variant="default">Ready</Badge>;
    return <Badge variant="secondary">Initializing</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="w-5 h-5" />
            {isElectron ? 'Electron Native Audio' : 'Browser Audio (Testing)'}
          </div>
          {getConnectionBadge()}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Status */}
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" />
          <span className="text-sm">
            {error ? error :
             isAudioReady ? 'Audio system ready for calls' :
             'Initializing audio devices...'}
          </span>
        </div>

        {/* Active Call Info */}
        {isCallActive && callId && (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Call {callId} - Audio routing through desktop application
            </AlertDescription>
          </Alert>
        )}

        {/* Audio Controls */}
        {isAudioReady && (
          <div className="space-y-4">
            
            {/* Microphone Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isMicMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span className="text-sm font-medium">Microphone</span>
                </div>
                <Button
                  onClick={toggleMicrophone}
                  variant={isMicMuted ? "destructive" : "default"}
                  size="sm"
                >
                  {isMicMuted ? 'Unmute' : 'Mute'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Level:</span>
                <Progress value={isMicMuted ? 0 : micLevel} className="flex-1" />
                <span className="text-xs w-8">{isMicMuted ? '0%' : `${micLevel}%`}</span>
              </div>
            </div>

            {/* Speaker Control */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  <span className="text-sm font-medium">Speaker</span>
                </div>
                <Button
                  onClick={toggleSpeaker}
                  variant={isSpeakerMuted ? "destructive" : "default"}
                  size="sm"
                >
                  {isSpeakerMuted ? 'Unmute' : 'Mute'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs">Level:</span>
                <Progress value={isSpeakerMuted ? 0 : speakerLevel} className="flex-1" />
                <span className="text-xs w-8">{isSpeakerMuted ? '0%' : `${Math.round(speakerLevel)}%`}</span>
              </div>
            </div>

            {/* Device Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Microphone: {audioDevices.mic}</div>
              <div>Speaker: {audioDevices.speaker}</div>
              <div>Mode: {isElectron ? 'Native Desktop Audio' : 'Browser Testing Mode'}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}