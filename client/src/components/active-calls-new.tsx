import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TelnyxCallControl } from "@/components/telnyx-call-control";
import { useCallContext } from "@/contexts/api-call-context";

export function ActiveCallsNew() {
  const { 
    activeCalls, 
    endCall, 
    holdCall, 
    resumeCall, 
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
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-2">No active calls</p>

          </div>
        </CardContent>
      </Card>
    );
  }

  const handleCallAction = (action: string, data?: any) => {
    const { callId } = data;
    
    switch (action) {
      case 'hangup':
        endCall(callId);
        break;
      case 'hold':
        holdCall(callId);
        break;
      case 'resume':
        resumeCall(callId);
        break;
      case 'transfer':
        const transferTo = prompt("Transfer to number:");
        if (transferTo) {
          transferCall(callId, transferTo);
        }
        break;
      case 'dtmf':
        const digits = prompt("Enter DTMF digits:");
        if (digits) {
          sendDTMF(callId, digits);
        }
        break;
      default:
        console.log('Unknown call action:', action, data);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Calls ({activeCalls.length})</CardTitle>

      </CardHeader>
      <CardContent className="space-y-4">
        {activeCalls.map((call) => (
          <TelnyxCallControl
            key={call.id}
            call={call}
            onCallAction={handleCallAction}
          />
        ))}
      </CardContent>
    </Card>
  );
}