import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Phone, PhoneOff, Pause, Play } from "lucide-react";
import type { Call } from "@shared/schema";

interface TelnyxCallControlProps {
  call: Call;
  onCallAction: (action: string, data?: any) => void;
}

export function TelnyxCallControl({ call, onCallAction }: TelnyxCallControlProps) {
  const [isOnHold, setIsOnHold] = useState(call.status === 'held');

  const handleHold = () => {
    const action = isOnHold ? 'resume' : 'hold';
    setIsOnHold(!isOnHold);
    onCallAction(action, { callId: call.callId });
  };

  const handleHangup = () => {
    onCallAction('hangup', { callId: call.callId });
  };

  const getCallStatusBadge = () => {
    switch (call.status) {
      case 'active':
        return <Badge variant="default">Active</Badge>;
      case 'held':
        return <Badge variant="secondary">On Hold</Badge>;
      case 'ringing':
        return <Badge variant="outline">Ringing</Badge>;
      case 'conference':
        return <Badge variant="default">Conference</Badge>;
      default:
        return <Badge variant="secondary">{call.status}</Badge>;
    }
  };



  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Call: {call.toNumber}
          </div>
          <div className="flex gap-2">
            {getCallStatusBadge()}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Call Information */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium">To:</span> {call.toNumber}
          </div>
          <div>
            <span className="font-medium">From:</span> {call.fromNumber}
          </div>
          <div>
            <span className="font-medium">Status:</span> {call.status}
          </div>
          <div>
            <span className="font-medium">Call ID:</span> {call.callId.slice(0, 8)}...
          </div>
        </div>



        {/* Call Control Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleHold}
            variant={isOnHold ? "default" : "outline"}
            className="flex-1"
          >
            {isOnHold ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
            {isOnHold ? 'Resume' : 'Hold'}
          </Button>
          
          <Button
            onClick={handleHangup}
            variant="destructive"
            className="flex-1"
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            Hang Up
          </Button>
        </div>


      </CardContent>
    </Card>
  );
}