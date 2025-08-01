import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  PhoneOff, 
  Pause, 
  Play, 
  Mic, 
  MicOff, 
  ArrowRightLeft,
  Users,
  Circle,
  Square
} from "lucide-react";
import { useCallContext } from "@/contexts/api-call-context";
import { formatDistanceToNow } from "date-fns";

export function ActiveCallsNew() {
  const { 
    activeCalls, 
    endCall, 
    holdCall, 
    resumeCall, 
    muteCall, 
    unmuteCall,
    transferCall,
    sendDTMF
  } = useCallContext();

  if (activeCalls.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Active Calls</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No active calls
          </p>
        </CardContent>
      </Card>
    );
  }

  const handleTransfer = (callId: string) => {
    const transferTo = prompt("Transfer to number:");
    if (transferTo) {
      transferCall(callId, transferTo);
    }
  };

  const handleDTMF = (callId: string) => {
    const digits = prompt("Enter DTMF digits:");
    if (digits) {
      sendDTMF(callId, digits);
    }
  };

  // Conference functionality temporarily disabled for API-only implementation

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Active Calls ({activeCalls.length})</CardTitle>

      </CardHeader>
      <CardContent className="space-y-4">
        {activeCalls.map((call) => {
          // Recording functionality will be available in desktop version
          const duration = call.startTime ? 
            formatDistanceToNow(new Date(call.startTime), { addSuffix: false }) : 
            '0m';

          return (
            <div key={call.id} className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{call.toNumber}</span>
                    <Badge variant={
                      call.status === 'active' ? 'default' :
                      call.status === 'held' ? 'secondary' :
                      call.status === 'ringing' ? 'outline' :
                      call.status === 'conference' ? 'destructive' :
                      'secondary'
                    }>
                      {call.status}
                    </Badge>
                    {call.metadata?.conferenceName && (
                      <Badge variant="outline">
                        {call.metadata.conferenceName}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    From: {call.fromNumber} • Duration: {duration}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Basic call controls */}
                <Button
                  onClick={() => endCall(call.id)}
                  variant="destructive"
                  size="sm"
                >
                  <PhoneOff className="w-4 h-4 mr-1" />
                  Hangup
                </Button>

                {call.status === 'active' ? (
                  <Button
                    onClick={() => holdCall(call.id)}
                    variant="outline"
                    size="sm"
                  >
                    <Pause className="w-4 h-4 mr-1" />
                    Hold
                  </Button>
                ) : call.status === 'held' ? (
                  <Button
                    onClick={() => resumeCall(call.id)}
                    variant="outline"
                    size="sm"
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Resume
                  </Button>
                ) : null}

                {/* Mute controls - only for active calls */}
                {call.status === 'active' && (
                  <>
                    <Button
                      onClick={() => muteCall(call.id)}
                      variant="outline"
                      size="sm"
                    >
                      <MicOff className="w-4 h-4 mr-1" />
                      Mute
                    </Button>
                    <Button
                      onClick={() => unmuteCall(call.id)}
                      variant="outline"
                      size="sm"
                    >
                      <Mic className="w-4 h-4 mr-1" />
                      Unmute
                    </Button>
                  </>
                )}

                {/* Transfer */}
                <Button
                  onClick={() => handleTransfer(call.id)}
                  variant="outline"
                  size="sm"
                >
                  <ArrowRightLeft className="w-4 h-4 mr-1" />
                  Transfer
                </Button>

                {/* DTMF */}
                <Button
                  onClick={() => handleDTMF(call.id)}
                  variant="outline"
                  size="sm"
                >
                  #*
                </Button>
              </div>

              {/* Additional call info */}
              {call.metadata && (
                <div className="text-xs text-muted-foreground space-y-1">
                  {call.metadata.direction && (
                    <div>Direction: {call.metadata.direction}</div>
                  )}
                  {call.metadata.telnyxCallControlId && (
                    <div>Call ID: {call.metadata.telnyxCallControlId.slice(-8)}</div>
                  )}
                  {call.metadata.transferredTo && (
                    <div>Transferred to: {call.metadata.transferredTo}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}