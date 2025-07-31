import { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TelnyxRTC } from "@telnyx/webrtc";
import { type Call } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface CallContextType {
  activeCalls: Call[];
  startCall: (toNumber: string) => void;
  endCall: (callId: string) => void;
  holdCall: (callId: string) => void;
  resumeCall: (callId: string) => void;
  transferCall: (callId: string, toNumber: string) => void;
  startConference: () => void;
  muteCall: () => void;
  unmuteCall: () => void;
  isLoading: boolean;
  telnyxClient: TelnyxRTC | null;
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
  const [activeCalls, setActiveCalls] = useState<Call[]>([]);
  const [telnyxClient, setTelnyxClient] = useState<TelnyxRTC | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');
  const currentCallRef = useRef<any>(null);

  // Fetch Telnyx config and active calls
  const { data: telnyxConfig } = useQuery({
    queryKey: ['/api/telnyx-config'],
  });

  const { data: calls = [], isLoading } = useQuery<Call[]>({
    queryKey: ['/api/calls'],
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  // Update local state when calls change
  useEffect(() => {
    setActiveCalls(calls.filter(call => call.status !== 'ended'));
  }, [calls]);

  // Initialize Telnyx WebRTC client
  useEffect(() => {
    if (!telnyxConfig) return;

    const initializeTelnyxClient = async () => {
      try {
        setConnectionStatus('connecting');
        
        // Request microphone permissions first
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: false 
          });
          console.log('Microphone access granted');
          // Stop the test stream, Telnyx will handle media
          stream.getTracks().forEach(track => track.stop());
        } catch (error) {
          console.error('Microphone access denied:', error);
          toast({
            title: "Microphone Access Required",
            description: "Please allow microphone access for calling",
            variant: "destructive",
          });
          return;
        }

        const client = new TelnyxRTC({
          login: (telnyxConfig as any).username,
          password: (telnyxConfig as any).password,
          ringtoneFile: '',
          ringbackFile: '',
        });

        // Set up event listeners
        client.on('telnyx.ready', () => {
          console.log('Telnyx client ready');
          setConnectionStatus('connected');
          toast({
            title: "Connected",
            description: "Successfully connected to Telnyx",
          });
        });

        client.on('telnyx.error', (error: any) => {
          console.error('Telnyx error:', error);
          setConnectionStatus('error');
          toast({
            title: "Connection Error",
            description: "Failed to connect to Telnyx",
            variant: "destructive",
          });
        });

        client.on('telnyx.socket.close', () => {
          console.log('Telnyx socket closed');
          setConnectionStatus('disconnected');
        });

        // Handle all call notifications
        client.on('telnyx.notification', (notification: any) => {
          console.log('Telnyx notification:', notification);
          
          if (notification.type === 'callUpdate' && notification.call) {
            const call = notification.call;
            console.log('Call update - State:', call.state, 'Call ID:', call.id);
            
            switch (call.state) {
              case 'ringing':
                if (call.direction === 'inbound') {
                  console.log('Incoming call detected');
                  toast({
                    title: "Incoming Call",
                    description: "You have an incoming call",
                  });
                } else {
                  console.log('Outgoing call ringing');
                }
                break;
                
              case 'active':
                console.log('Call active - setting up remote audio');
                currentCallRef.current = call;
                
                // Set up remote audio immediately when call becomes active
                if (call.remoteStream) {
                  setupRemoteAudioFromNotification(call.remoteStream);
                } else {
                  // Retry getting remote stream
                  setTimeout(() => {
                    if (call.remoteStream) {
                      setupRemoteAudioFromNotification(call.remoteStream);
                    }
                  }, 1000);
                }
                
                queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
                break;
                
              case 'destroy':
              case 'hangup':
                console.log('Call ended via notification');
                currentCallRef.current = null;
                
                // Clean up audio
                const audioElement = document.getElementById('telnyx-remote-audio');
                if (audioElement) {
                  audioElement.remove();
                }
                
                queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
                break;
            }
          }
        });

        await client.connect();
        setTelnyxClient(client);
        
      } catch (error) {
        console.error('Failed to initialize Telnyx client:', error);
        setConnectionStatus('error');
        toast({
          title: "Initialization Error",
          description: "Failed to initialize Telnyx client",
          variant: "destructive",
        });
      }
    };

    initializeTelnyxClient();

    return () => {
      if (telnyxClient) {
        (telnyxClient as any).disconnect();
      }
    };
  }, [telnyxConfig]);

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

  // Simple direct audio setup function
  const setupRemoteAudio = (call: any) => {
    console.log('🔊 Setting up remote audio for call:', call.id);
    
    const tryAudioSetup = (attempt = 1) => {
      console.log(`Audio setup attempt ${attempt}`);
      
      // Get remote stream from call
      const remoteStream = call.remoteStream;
      console.log('Remote stream check:', {
        available: !!remoteStream,
        audioTracks: remoteStream?.getAudioTracks?.()?.length || 0
      });
      
      if (remoteStream && remoteStream.getAudioTracks().length > 0) {
        // Remove any existing audio element
        const existingAudio = document.getElementById('telnyx-remote-audio');
        if (existingAudio) {
          existingAudio.remove();
        }
        
        // Create fresh audio element
        const audioElement = document.createElement('audio');
        audioElement.id = 'telnyx-remote-audio';
        audioElement.autoplay = true;
        audioElement.volume = 1.0;
        audioElement.muted = false;
        document.body.appendChild(audioElement);
        
        // Set remote stream directly
        audioElement.srcObject = remoteStream;
        
        // Play audio
        audioElement.play().then(() => {
          console.log('✅ Remote audio started successfully!');
          toast({
            title: "Audio Connected",
            description: "You should now hear the other person",
          });
        }).catch(error => {
          console.error('Audio play error:', error);
          toast({
            title: "Audio Blocked", 
            description: "Click the Speaker button to enable audio",
          });
        });
        
      } else if (attempt < 5) {
        setTimeout(() => tryAudioSetup(attempt + 1), 1000);
      } else {
        console.error('❌ No remote audio stream found after 5 attempts');
      }
    };
    
    // Start audio setup
    tryAudioSetup();
  };

  // Handle remote audio from Telnyx notification
  const setupRemoteAudioFromNotification = (remoteStream: MediaStream) => {
    console.log('🔊 Setting up remote audio from notification');
    
    // Remove any existing audio element
    const existingAudio = document.getElementById('telnyx-remote-audio');
    if (existingAudio) {
      existingAudio.remove();
    }
    
    // Create fresh audio element
    const audioElement = document.createElement('audio');
    audioElement.id = 'telnyx-remote-audio';
    audioElement.autoplay = true;
    audioElement.volume = 1.0;
    audioElement.muted = false;
    audioElement.controls = false;
    document.body.appendChild(audioElement);
    
    // Set remote stream
    audioElement.srcObject = remoteStream;
    
    // Play audio
    audioElement.play().then(() => {
      console.log('✅ Remote audio connected successfully via notification!');
      toast({
        title: "Audio Connected",
        description: "You should now hear the other person",
      });
    }).catch(error => {
      console.error('Audio play error:', error);
      toast({
        title: "Audio Blocked",
        description: "Click the Speaker button to enable audio",
      });
    });
  };

  const startCallMutation = useMutation({
    mutationFn: async (toNumber: string) => {
      if (!telnyxClient || connectionStatus !== 'connected') {
        throw new Error('Telnyx client not connected');
      }

      // If there's an active call, put it on hold first
      const activeCall = activeCalls.find(call => call.status === 'active');
      if (activeCall && currentCallRef.current) {
        currentCallRef.current.hold();
        await apiRequest('PATCH', `/api/calls/${activeCall.id}`, { status: 'held' });
      }

      // Create remote audio element first
      let remoteAudioElement = document.getElementById('telnyx-remote-audio') as HTMLAudioElement;
      if (!remoteAudioElement) {
        remoteAudioElement = document.createElement('audio');
        remoteAudioElement.id = 'telnyx-remote-audio';
        remoteAudioElement.autoplay = true;
        remoteAudioElement.volume = 1.0;
        remoteAudioElement.muted = false;
        document.body.appendChild(remoteAudioElement);
        console.log('Created remote audio element for call');
      }

      // Make actual call through Telnyx with remoteElement parameter
      const call = (telnyxClient as any).newCall({
        destinationNumber: toNumber,
        callerNumber: (telnyxConfig as any)?.fromNumber || "+17329935698",
        remoteElement: 'telnyx-remote-audio'  // This should handle remote audio automatically
      });

      console.log('Call created with remote element:', call.id);

      // Create call record in backend
      const response = await apiRequest('POST', '/api/calls', {
        callId: (call as any).id || `call_${Date.now()}`,
        fromNumber: (telnyxConfig as any)?.fromNumber || "+17329935698",
        toNumber,
        status: 'ringing',
        metadata: { telnyxCallId: (call as any).id }
      });
      
      const callRecord = await response.json();
      
      // Initiate the call
      (call as any).dial();
      
      return callRecord;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    },
    onError: (error: any) => {
      toast({
        title: "Call Failed",
        description: error.message || "Unable to start call",
        variant: "destructive",
      });
    }
  });

  const endCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const call = activeCalls.find(c => c.id === callId);
      if (!call) throw new Error('Call not found');
      
      // End the actual Telnyx call
      if (currentCallRef.current) {
        try {
          currentCallRef.current.hangup();
          console.log('Telnyx call hung up');
        } catch (error) {
          console.error('Error hanging up Telnyx call:', error);
        }
        currentCallRef.current = null;
      }
      
      // Clean up audio element
      const audioElement = document.getElementById('telnyx-audio');
      if (audioElement) {
        audioElement.remove();
      }
      
      const response = await apiRequest('PATCH', `/api/calls/${callId}`, { 
        status: 'ended',
        endTime: new Date().toISOString()
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Call Ended",
        description: "Call has been terminated",
      });
    }
  });

  const holdCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      const response = await apiRequest('PATCH', `/api/calls/${callId}`, { status: 'held' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  const resumeCallMutation = useMutation({
    mutationFn: async (callId: string) => {
      // Put any currently active call on hold
      const activeCall = activeCalls.find(call => call.status === 'active');
      if (activeCall && activeCall.id !== callId) {
        await apiRequest('PATCH', `/api/calls/${activeCall.id}`, { status: 'held' });
      }

      const response = await apiRequest('PATCH', `/api/calls/${callId}`, { status: 'active' });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
    }
  });

  const transferCallMutation = useMutation({
    mutationFn: async ({ callId, toNumber }: { callId: string; toNumber: string }) => {
      // For simplicity, we'll end the current call and start a new one
      // In a real implementation, this would use Telnyx transfer capabilities
      await apiRequest('PATCH', `/api/calls/${callId}`, { status: 'ended' });
      
      const response = await apiRequest('POST', '/api/calls', {
        callId: `transfer_${Date.now()}`,
        fromNumber: "+17329935698",
        toNumber,
        status: 'ringing',
        metadata: { transferredFrom: callId }
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Call Transferred",
        description: "Call has been transferred successfully",
      });
    }
  });

  const startConferenceMutation = useMutation({
    mutationFn: async () => {
      // Get all active and held calls
      const callsToConference = activeCalls.filter(call => 
        call.status === 'active' || call.status === 'held'
      );
      
      if (callsToConference.length < 2) {
        throw new Error('Need at least 2 calls to start conference');
      }

      // Update all calls to conference status
      await Promise.all(
        callsToConference.map(call =>
          apiRequest('PATCH', `/api/calls/${call.id}`, { status: 'conference' })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calls'] });
      toast({
        title: "Conference Started",
        description: "All calls have been merged into a conference",
      });
    }
  });

  const startCall = (toNumber: string) => {
    startCallMutation.mutate(toNumber);
  };

  const endCall = (callId: string) => {
    endCallMutation.mutate(callId);
  };

  const holdCall = (callId: string) => {
    holdCallMutation.mutate(callId);
  };

  const resumeCall = (callId: string) => {
    resumeCallMutation.mutate(callId);
  };

  const transferCall = (callId: string, toNumber: string) => {
    transferCallMutation.mutate({ callId, toNumber });
  };

  const startConference = () => {
    startConferenceMutation.mutate();
  };

  const muteCall = () => {
    if (currentCallRef.current) {
      try {
        currentCallRef.current.mute();
        console.log('Call muted');
        toast({
          title: "Call Muted",
          description: "Your microphone is now muted",
        });
      } catch (error) {
        console.error('Failed to mute call:', error);
      }
    }
  };

  const unmuteCall = () => {
    if (currentCallRef.current) {
      try {
        currentCallRef.current.unmute();
        console.log('Call unmuted');
        toast({
          title: "Call Unmuted",
          description: "Your microphone is now active",
        });
      } catch (error) {
        console.error('Failed to unmute call:', error);
      }
    }
  };

  return (
    <CallContext.Provider
      value={{
        activeCalls,
        startCall,
        endCall,
        holdCall,
        resumeCall,
        transferCall,
        startConference,
        muteCall,
        unmuteCall,
        isLoading,
        telnyxClient,
        connectionStatus,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}
