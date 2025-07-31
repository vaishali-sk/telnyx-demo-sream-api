import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, PhoneOff, Pause, Play, Volume2, VolumeX, Users, ArrowRight, Delete } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface SipCall {
  id: string;
  callId: string;
  direction: 'inbound' | 'outbound';
  remoteUri: string;
  localUri: string;
  status: 'connecting' | 'ringing' | 'active' | 'held' | 'ended';
  startTime?: string;
  answerTime?: string;
  endTime?: string;
  conferenceId?: string;
}

export function SipPhone() {
  const [sipCalls, setSipCalls] = useState<SipCall[]>([]);
  const [isRegistered, setIsRegistered] = useState(false);
  const [conferences, setConferences] = useState<Map<string, string[]>>(new Map());
  const { toast } = useToast();

  // Simulate SIP status updates
  useEffect(() => {
    // Simulate registration
    setTimeout(() => {
      setIsRegistered(true);
      toast({
        title: "SIP Connected",
        description: "SIP client registered successfully",
      });
    }, 1000);

    // Simulate periodic status updates
    const interval = setInterval(() => {
      // In real implementation, this would fetch from SIP client
      // For now, we'll just maintain current state
    }, 5000);

    return () => clearInterval(interval);
  }, [toast]);

  const makeCall = async (number: string) => {
    try {
      const response = await fetch('/api/sip/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toNumber: number })
      });
      
      if (response.ok) {
        const call = await response.json();
        setSipCalls(prev => [...prev, call]);
        toast({
          title: "SIP Call Started",
          description: `🎧 Calling ${number} via SIP - Audio streaming enabled`,
        });
      }
    } catch (error) {
      toast({
        title: "Call Failed",
        description: "Failed to start SIP call",
        variant: "destructive",
      });
    }
  };

  // Add dialer functionality to SIP phone
  const [dialerNumber, setDialerNumber] = useState("");

  const handleKeypadClick = (digit: string) => {
    setDialerNumber(prev => prev + digit);
  };

  const handleCall = () => {
    if (dialerNumber.trim()) {
      makeCall(dialerNumber.trim());
      setDialerNumber("");
    }
  };

  const handleClear = () => {
    setDialerNumber("");
  };

  const answerCall = async (callId: string) => {
    try {
      await fetch(`/api/sip/calls/${callId}/answer`, { method: 'POST' });
      setSipCalls(prev => prev.map(call => 
        call.id === callId ? { ...call, status: 'active' as const } : call
      ));
    } catch (error) {
      console.error('Failed to answer call:', error);
    }
  };

  const hangupCall = async (callId: string) => {
    try {
      await fetch(`/api/sip/calls/${callId}/hangup`, { method: 'POST' });
      setSipCalls(prev => prev.filter(call => call.id !== callId));
    } catch (error) {
      console.error('Failed to hangup call:', error);
    }
  };

  const holdCall = async (callId: string) => {
    try {
      await fetch(`/api/sip/calls/${callId}/hold`, { method: 'POST' });
      setSipCalls(prev => prev.map(call => 
        call.id === callId 
          ? { ...call, status: call.status === 'held' ? 'active' as const : 'held' as const }
          : call
      ));
    } catch (error) {
      console.error('Failed to hold/resume call:', error);
    }
  };

  const createConference = async () => {
    try {
      const response = await fetch('/api/sip/conferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Conference ${Date.now()}` })
      });
      
      if (response.ok) {
        const { conferenceId } = await response.json();
        setConferences(prev => new Map(prev).set(conferenceId, []));
        toast({
          title: "Conference Created",
          description: `Conference ID: ${conferenceId}`,
        });
      }
    } catch (error) {
      toast({
        title: "Conference Failed",
        description: "Failed to create conference",
        variant: "destructive",
      });
    }
  };

  const addToConference = async (callId: string, conferenceId: string) => {
    try {
      await fetch(`/api/sip/calls/${callId}/conference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId })
      });
      
      setSipCalls(prev => prev.map(call => 
        call.id === callId ? { ...call, conferenceId } : call
      ));
      
      toast({
        title: "Joined Conference",
        description: `Call added to conference`,
      });
    } catch (error) {
      console.error('Failed to join conference:', error);
    }
  };

  const transferCall = async (callId: string, targetNumber: string) => {
    try {
      await fetch(`/api/sip/calls/${callId}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: targetNumber })
      });
      
      toast({
        title: "Transfer Initiated",
        description: `Transferring call to ${targetNumber}`,
      });
    } catch (error) {
      toast({
        title: "Transfer Failed",
        description: "Failed to transfer call",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'ringing': return 'bg-yellow-500';
      case 'held': return 'bg-blue-500';
      case 'connecting': return 'bg-orange-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <PhoneCall className="w-4 h-4" />;
      case 'ringing': return <Phone className="w-4 h-4 animate-pulse" />;
      case 'held': return <Pause className="w-4 h-4" />;
      default: return <Phone className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* SIP Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            SIP Phone Status
            <Badge variant={isRegistered ? "default" : "destructive"}>
              {isRegistered ? "Registered" : "Disconnected"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* SIP Dialer */}
          <div className="space-y-3">
            <Input
              value={dialerNumber}
              onChange={(e) => setDialerNumber(e.target.value)}
              placeholder="Enter phone number..."
              className="text-center text-lg"
            />
            
            {/* Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
                <Button
                  key={digit}
                  onClick={() => handleKeypadClick(digit)}
                  variant="outline"
                  size="sm"
                  className="aspect-square"
                >
                  {digit}
                </Button>
              ))}
            </div>
            
            {/* Call Controls */}
            <div className="flex gap-2">
              <Button
                onClick={handleCall}
                disabled={!dialerNumber.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <PhoneCall className="w-4 h-4 mr-2" />
                SIP Call
              </Button>
              <Button onClick={handleClear} variant="outline" size="sm">
                <Delete className="w-4 h-4" />
              </Button>
            </div>
          </div>
          
          <div className="border-t pt-3">
            <Button onClick={createConference} variant="outline" size="sm" className="w-full">
              <Users className="w-4 h-4 mr-2" />
              Create Conference
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active SIP Calls */}
      <Card>
        <CardHeader>
          <CardTitle>SIP Calls ({sipCalls.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {sipCalls.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              No active SIP calls
            </p>
          ) : (
            <div className="space-y-3">
              {sipCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(call.status)}`} />
                    {getStatusIcon(call.status)}
                    <div>
                      <p className="font-medium">
                        {call.remoteUri.replace('sip:', '').split('@')[0]}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {call.direction} • {call.status}
                        {call.conferenceId && (
                          <span className="ml-2">
                            <Users className="w-3 h-3 inline mr-1" />
                            Conference
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {call.status === 'ringing' && call.direction === 'inbound' && (
                      <Button
                        onClick={() => answerCall(call.id)}
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <PhoneCall className="w-4 h-4" />
                      </Button>
                    )}
                    
                    {(call.status === 'active' || call.status === 'held') && (
                      <>
                        <Button
                          onClick={() => holdCall(call.id)}
                          variant="outline"
                          size="sm"
                        >
                          {call.status === 'held' ? 
                            <Play className="w-4 h-4" /> : 
                            <Pause className="w-4 h-4" />
                          }
                        </Button>
                        
                        <Button
                          onClick={() => transferCall(call.id, prompt('Transfer to number:') || '')}
                          variant="outline"
                          size="sm"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Button>
                        
                        {conferences.size > 0 && !call.conferenceId && (
                          <Button
                            onClick={() => {
                              const confId = Array.from(conferences.keys())[0];
                              addToConference(call.id, confId);
                            }}
                            variant="outline"
                            size="sm"
                          >
                            <Users className="w-4 h-4" />
                          </Button>
                        )}
                      </>
                    )}
                    
                    <Button
                      onClick={() => hangupCall(call.id)}
                      size="sm"
                      variant="destructive"
                    >
                      <PhoneOff className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Conference Status */}
      {conferences.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Active Conferences ({conferences.size})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {Array.from(conferences.entries()).map(([confId, participantIds]) => (
              <div key={confId} className="p-3 border rounded-lg">
                <p className="font-medium">Conference: {confId}</p>
                <p className="text-sm text-muted-foreground">
                  {participantIds.length} participants
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}