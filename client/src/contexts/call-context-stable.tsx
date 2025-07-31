import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Call } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CallContextType {
  activeCalls: Call[];
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  isMuted: boolean;
  
  // Basic call operations
  startCall: (toNumber: string, fromNumber?: string) => void;
  answerCall: (callId: string) => void;
  hangupCall: (callId: string) => void;
  holdCall: (callId: string) => void;
  resumeCall: (callId: string) => void;
  muteCall: (callId: string) => void;
  unmuteCall: (callId: string) => void;
  
  // Transfer operations
  blindTransfer: (callId: string, toNumber: string) => void;
  attendedTransfer: (callId: string, targetCallId: string) => void;
  
  // Conference operations
  createConference: (name?: string) => void;
  joinConference: (callId: string, conferenceName: string) => void;
  leaveConference: (callId: string) => void;
  
  // Recording operations
  startRecording: (callId: string) => void;
  stopRecording: (callId: string) => void;
  
  // DTMF
  sendDTMF: (callId: string, digits: string) => void;
  
  // Test connection
  testConnection: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export function useCallContext() {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error("useCallContext must be used within a CallProvider");
  }
  return context;
}

interface CallProviderProps {
  children: ReactNode;
}

export function CallProvider({ children }: CallProviderProps) {
  const { toast } = useToast();
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const [isMuted, setIsMuted] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasTestedConnection = useRef(false);

  // Fetch active calls
  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ['/api/calls'],
    refetchInterval: 5000,
  });

  // Simple audio functions without hooks
  const playRingtone = () => {
    try {
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
  };

  // Update calls and handle audio - simplified logic
  useEffect(() => {
    const newActiveCalls = calls.filter(call => call.status !== 'ended');
    const hasRingingCall = newActiveCalls.some(call => call.status === 'ringing');
    const previouslyHadRingingCall = activeCalls.some(call => call.status === 'ringing');
    
    // Play ringtone only when transitioning from no ringing to ringing
    if (hasRingingCall && !previouslyHadRingingCall) {
      playRingtone();
    }
    
    // Check for active calls and show audio status
    const hasActiveCall = newActiveCalls.some(call => call.status === 'active');
    if (hasActiveCall && newActiveCalls.length > activeCalls.filter(c => c.status === 'active').length) {
      // New active call - audio streaming would start here
      console.log('🎧 Call connected - Audio streaming would be active with SIP/WebRTC integration');
      toast({
        title: "Call Connected",
        description: "Call is active. Audio requires SIP integration for full functionality.",
      });
    }
    
    setActiveCalls(newActiveCalls);
  }, [calls.length, calls.map(c => c.id + c.status).join(',')]); // Stable dependency

  // WebSocket connection - simplified
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => console.log('WebSocket connected');
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'call_status_update') {
          queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
    socket.onclose = () => console.log('WebSocket disconnected');

    return () => socket.close();
  }, []);

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      setConnectionStatus('connecting');
      const response = await apiRequest('POST', '/api/telnyx-test', {});
      return response.json();
    },
    onSuccess: () => {
      setConnectionStatus('connected');
      toast({
        title: "Connected",
        description: "Telnyx API connection successful",
      });
    },
    onError: () => {
      setConnectionStatus('error');
      toast({
        title: "Connection Error",
        description: "Failed to connect to Telnyx API",
        variant: "destructive",
      });
    }
  });

  // Start call mutation
  const startCallMutation = useMutation({
    mutationFn: async ({ toNumber, fromNumber }: { toNumber: string; fromNumber?: string }) => {
      const response = await apiRequest('POST', '/api/calls', { toNumber, fromNumber });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Call Started",
        description: "Call initiated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Call Failed",
        description: error.message || "Unable to start call",
        variant: "destructive",
      });
    }
  });

  // Call action mutation
  const callActionMutation = useMutation({
    mutationFn: async ({ callId, action }: { callId: string; action: string }) => {
      const response = await apiRequest('PATCH', `/api/calls/${callId}`, { action });
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      
      const actionMessages = {
        answer: "Call answered",
        hangup: "Call ended",
        hold: "Call on hold",
        unhold: "Call resumed",
        mute: "Call muted",
        unmute: "Call unmuted"
      };
      
      toast({
        title: "Success",
        description: actionMessages[variables.action as keyof typeof actionMessages] || "Action completed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Action Failed",
        description: error.message || "Failed to perform action",
        variant: "destructive",
      });
    }
  });

  // Test connection only once on mount
  useEffect(() => {
    if (!hasTestedConnection.current && connectionStatus === 'disconnected') {
      hasTestedConnection.current = true;
      testConnectionMutation.mutate();
    }
  }, []);

  // Memoize context value to prevent re-renders
  const contextValue = useMemo<CallContextType>(() => ({
    activeCalls,
    isLoading,
    connectionStatus,
    isMuted,
    
    // Basic operations
    startCall: (toNumber: string, fromNumber?: string) => {
      startCallMutation.mutate({ toNumber, fromNumber });
    },
    answerCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'answer' });
    },
    hangupCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'hangup' });
    },
    holdCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'hold' });
    },
    resumeCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'unhold' });
    },
    muteCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'mute' });
      setIsMuted(true);
    },
    unmuteCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'unmute' });
      setIsMuted(false);
    },
    
    // Transfer operations - simplified
    blindTransfer: (callId: string, toNumber: string) => {
      toast({ title: "Transfer", description: "Transfer functionality coming soon" });
    },
    attendedTransfer: (callId: string, targetCallId: string) => {
      toast({ title: "Transfer", description: "Transfer functionality coming soon" });
    },
    
    // Conference operations - simplified
    createConference: (name?: string) => {
      toast({ title: "Conference", description: "Conference functionality coming soon" });
    },
    joinConference: (callId: string, conferenceName: string) => {
      toast({ title: "Conference", description: "Conference functionality coming soon" });
    },
    leaveConference: (callId: string) => {
      toast({ title: "Conference", description: "Conference functionality coming soon" });
    },
    
    // Recording operations - simplified
    startRecording: (callId: string) => {
      toast({ title: "Recording", description: "Recording functionality coming soon" });
    },
    stopRecording: (callId: string) => {
      toast({ title: "Recording", description: "Recording functionality coming soon" });
    },
    
    // DTMF - simplified
    sendDTMF: (callId: string, digits: string) => {
      toast({ title: "DTMF", description: "DTMF functionality coming soon" });
    },
    
    // Test connection
    testConnection: () => {
      testConnectionMutation.mutate();
    }
  }), [activeCalls, isLoading, connectionStatus, isMuted, startCallMutation, callActionMutation, testConnectionMutation]);

  return (
    <CallContext.Provider value={contextValue}>
      {children}
    </CallContext.Provider>
  );
}