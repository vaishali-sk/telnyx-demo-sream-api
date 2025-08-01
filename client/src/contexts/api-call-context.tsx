import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { type Call } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CallContextType {
  activeCalls: Call[];
  startCall: (toNumber: string, fromNumber?: string) => Promise<void>;
  endCall: (callId: string) => Promise<void>;
  holdCall: (callId: string) => Promise<void>;
  resumeCall: (callId: string) => Promise<void>;
  transferCall: (callId: string, toNumber: string) => Promise<void>;
  muteCall: (callId: string) => Promise<void>;
  unmuteCall: (callId: string) => Promise<void>;
  sendDTMF: (callId: string, digits: string) => Promise<void>;
  testConnection: () => Promise<void>;
  isLoading: boolean;
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
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
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  // Fetch active calls - use the data directly instead of local state
  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ['/api/calls'],
    refetchInterval: 3000, // Refetch every 3 seconds
  });

  // Compute active calls directly from query data
  const activeCalls = calls.filter(call => call.status !== 'ended');

  // Test connection mutation
  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/telnyx-test');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
      }
      toast({
        title: data.success ? "Connection Test Successful" : "Connection Test Failed",
        description: data.message,
        variant: data.success ? "default" : "destructive",
      });
    },
    onError: () => {
      setConnectionStatus('error');
      toast({
        title: "Connection Test Failed",
        description: "Unable to connect to Telnyx API",
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Call Started",
        description: `Calling ${data.toNumber}`,
      });
    },
    onError: () => {
      toast({
        title: "Call Failed",
        description: "Failed to start the call",
        variant: "destructive",
      });
    }
  });

  // End call mutation
  const endCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('PATCH', `/api/calls/${call.id}`, { action: 'hangup' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Call Ended",
        description: "Call has been terminated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to End Call",
        description: "Could not terminate the call",
        variant: "destructive",
      });
    }
  });

  // Hold/Resume call mutations
  const holdCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('PATCH', `/api/calls/${call.id}`, { action: 'hold' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  const resumeCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('PATCH', `/api/calls/${call.id}`, { action: 'unhold' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  // Mute/Unmute call mutations
  const muteCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('PATCH', `/api/calls/${call.id}`, { action: 'mute' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  const unmuteCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('PATCH', `/api/calls/${call.id}`, { action: 'unmute' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  // Transfer call mutation
  const transferCallMutation = useMutation({
    mutationFn: async ({ callId, toNumber }: { callId: string; toNumber: string }) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('POST', `/api/calls/${call.id}/transfer`, { to: toNumber });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Transfer Initiated",
        description: "Call transfer in progress",
      });
    }
  });

  // DTMF mutation
  const dtmfMutation = useMutation({
    mutationFn: async ({ callId, digits }: { callId: string; digits: string }) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      const response = await apiRequest('POST', `/api/calls/${call.id}/dtmf`, { digits });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "DTMF Sent",
        description: "Digits sent successfully",
      });
    }
  });

  // Context value
  const contextValue: CallContextType = {
    activeCalls,
    startCall: async (toNumber: string, fromNumber?: string) => {
      await startCallMutation.mutateAsync({ toNumber, fromNumber });
    },
    endCall: async (callId: string) => {
      await endCallMutation.mutateAsync(callId);
    },
    holdCall: async (callId: string) => {
      await holdCallMutation.mutateAsync(callId);
    },
    resumeCall: async (callId: string) => {
      await resumeCallMutation.mutateAsync(callId);
    },
    transferCall: async (callId: string, toNumber: string) => {
      await transferCallMutation.mutateAsync({ callId, toNumber });
    },
    muteCall: async (callId: string) => {
      await muteCallMutation.mutateAsync(callId);
    },
    unmuteCall: async (callId: string) => {
      await unmuteCallMutation.mutateAsync(callId);
    },
    sendDTMF: async (callId: string, digits: string) => {
      await dtmfMutation.mutateAsync({ callId, digits });
    },
    testConnection: async () => {
      await testConnectionMutation.mutateAsync();
    },
    isLoading,
    connectionStatus
  };

  return (
    <CallContext.Provider value={contextValue}>
      {children}
    </CallContext.Provider>
  );
}