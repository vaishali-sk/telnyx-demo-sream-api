import { useEffect, useRef, useState, useCallback } from 'react';

export function useAudio() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Create audio element for call audio
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.autoplay = true;
      audioRef.current.controls = false;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const playRingtone = useCallback(() => {
    try {
      // Initialize AudioContext only when needed
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const audioContext = audioContextRef.current;
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }
      
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 1);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 1);
    } catch (error) {
      console.warn('Could not play ringtone:', error);
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
  }, []);

  const mute = useCallback(() => {
    setIsMuted(true);
    if (audioRef.current) {
      audioRef.current.volume = 0;
    }
  }, []);

  const unmute = useCallback(() => {
    setIsMuted(false);
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const setAudioVolume = (newVolume: number) => {
    setVolume(newVolume);
    if (audioRef.current && !isMuted) {
      audioRef.current.volume = newVolume;
    }
  };

  return {
    playRingtone,
    stopRingtone,
    mute,
    unmute,
    setVolume: setAudioVolume,
    isMuted,
    volume,
    audioElement: audioRef.current
  };
}