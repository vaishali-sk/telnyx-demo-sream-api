import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCallContext } from "@/contexts/call-context";
import { Pause, Play, PhoneOff, Users } from "lucide-react";

interface ActiveCallsProps {
  onTransfer: () => void;
}

export function ActiveCalls({ onTransfer }: ActiveCallsProps) {
  const { activeCalls, endCall, holdCall, resumeCall, startConference } = useCallContext();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-700';
      case 'held':
        return 'bg-amber-100 text-amber-700';
      case 'ringing':
        return 'bg-blue-100 text-blue-700';
      case 'conference':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'held':
        return 'On Hold';
      case 'ringing':
        return 'Ringing';
      case 'conference':
        return 'Conference';
      default:
        return status;
    }
  };

  return (
    <div className="flex-1 p-6 border-t border-gray-100">
      <h3 className="text-sm font-medium text-gray-900 mb-4">Active Calls</h3>
      
      {activeCalls.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">No active calls</p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeCalls.map((call) => (
            <div
              key={call.id}
              className={`rounded-lg p-4 border transition-colors ${
                call.status === 'held' ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{call.toNumber}</span>
                <Badge className={getStatusColor(call.status)}>
                  {getStatusText(call.status)}
                </Badge>
              </div>
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  {call.startTime && 
                    new Date(call.startTime).toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })
                  }
                </span>
                <div className="flex space-x-2">
                  {call.status === 'active' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => holdCall(call.id)}
                      className="text-amber-600 hover:text-amber-700 p-1"
                    >
                      <Pause className="w-4 h-4" />
                    </Button>
                  ) : call.status === 'held' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => resumeCall(call.id)}
                      className="text-green-600 hover:text-green-700 p-1"
                    >
                      <Play className="w-4 h-4" />
                    </Button>
                  ) : null}
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => endCall(call.id)}
                    className="text-red-600 hover:text-red-700 p-1"
                  >
                    <PhoneOff className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
          
          {/* Conference merge option when 2+ calls exist */}
          {activeCalls.length >= 2 && (
            <Button
              variant="outline"
              className="w-full p-3 border-2 border-dashed border-purple-300 text-purple-600 hover:bg-purple-50"
              onClick={startConference}
            >
              <Users className="w-5 h-5 mr-2" />
              Merge into Conference
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
