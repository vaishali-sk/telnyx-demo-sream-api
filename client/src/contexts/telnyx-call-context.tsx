import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Call } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CallContextType {
  activeCalls: Call[];
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  
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

  // Fetch active calls
  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ['/api/calls'],
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Update local state when calls change
  useEffect(() => {
    setActiveCalls(calls.filter(call => call.status !== 'ended'));
  }, [calls]);

  // WebSocket connection for real-time updates
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const socket = new WebSocket(wsUrl);

    socket.onopen = () => {
      console.log('WebSocket connected');
    };

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

    socket.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      socket.close();
    };
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
    // onError: (error: any) => {
    //   setConnectionStatus('error');
    //   toast({
    //     title: "Demo Mode",
    //     description: "Using demo credentials - get real Telnyx account for live calls",
    //     variant: "destructive",
    //   });
    // }
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

  // Transfer mutations
  const transferMutation = useMutation({
    mutationFn: async ({ callId, to, type, targetCallId }: { 
      callId: string; 
      to?: string; 
      type: 'blind' | 'attended';
      targetCallId?: string;
    }) => {
      const body = type === 'blind' ? { to, type } : { type, targetCallId };
      const response = await apiRequest('POST', `/api/calls/${callId}/transfer`, body);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Transfer Complete",
        description: "Call transferred successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Transfer Failed",
        description: error.message || "Failed to transfer call",
        variant: "destructive",
      });
    }
  });

  // Conference mutations
  const conferenceMutation = useMutation({
    mutationFn: async ({ action, callId, conferenceName, name }: { 
      action: 'create' | 'join' | 'leave';
      callId?: string;
      conferenceName?: string;
      name?: string;
    }) => {
      if (action === 'create') {
        const response = await apiRequest('POST', '/api/conferences', { name });
        return response.json();
      } else if (action === 'join') {
        const response = await apiRequest('POST', `/api/calls/${callId}/join-conference`, { conferenceName });
        return response.json();
      } else if (action === 'leave') {
        const response = await apiRequest('POST', `/api/calls/${callId}/leave-conference`, {});
        return response.json();
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      
      const messages = {
        create: "Conference created",
        join: "Joined conference",
        leave: "Left conference"
      };
      
      toast({
        title: "Success",
        description: messages[variables.action],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Conference Error",
        description: error.message || "Conference operation failed",
        variant: "destructive",
      });
    }
  });

  // Recording mutations
  const recordingMutation = useMutation({
    mutationFn: async ({ callId, action }: { callId: string; action: 'start' | 'stop' }) => {
      const endpoint = action === 'start' ? 'start-recording' : 'stop-recording';
      const response = await apiRequest('POST', `/api/calls/${callId}/${endpoint}`, {});
      return response.json();
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      
      const message = variables.action === 'start' ? "Recording started" : "Recording stopped";
      toast({
        title: "Success",
        description: message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Recording Error",
        description: error.message || "Recording operation failed",
        variant: "destructive",
      });
    }
  });

  // DTMF mutation
  const dtmfMutation = useMutation({
    mutationFn: async ({ callId, digits }: { callId: string; digits: string }) => {
      const response = await apiRequest('POST', `/api/calls/${callId}/dtmf`, { digits });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "DTMF Sent",
        description: "Touch tones sent successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "DTMF Failed",
        description: error.message || "Failed to send touch tones",
        variant: "destructive",
      });
    }
  });

  // Test connection on mount
  useEffect(() => {
    testConnectionMutation.mutate();
  }, []);

  // Context value
  const contextValue: CallContextType = {
    activeCalls,
    isLoading,
    connectionStatus,
    
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
    },
    unmuteCall: (callId: string) => {
      callActionMutation.mutate({ callId, action: 'unmute' });
    },
    
    // Transfer operations
    blindTransfer: (callId: string, toNumber: string) => {
      transferMutation.mutate({ callId, to: toNumber, type: 'blind' });
    },
    attendedTransfer: (callId: string, targetCallId: string) => {
      transferMutation.mutate({ callId, type: 'attended', targetCallId });
    },
    
    // Conference operations
    createConference: (name?: string) => {
      conferenceMutation.mutate({ action: 'create', name });
    },
    joinConference: (callId: string, conferenceName: string) => {
      conferenceMutation.mutate({ action: 'join', callId, conferenceName });
    },
    leaveConference: (callId: string) => {
      conferenceMutation.mutate({ action: 'leave', callId });
    },
    
    // Recording operations
    startRecording: (callId: string) => {
      recordingMutation.mutate({ callId, action: 'start' });
    },
    stopRecording: (callId: string) => {
      recordingMutation.mutate({ callId, action: 'stop' });
    },
    
    // DTMF
    sendDTMF: (callId: string, digits: string) => {
      dtmfMutation.mutate({ callId, digits });
    },
    
    // Test connection
    testConnection: () => {
      testConnectionMutation.mutate();
    }
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
    </CallContext.Provider>
  );
}