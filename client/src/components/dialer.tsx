import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallContext } from "@/contexts/call-context";
import { Phone, PhoneOff, Pause, ArrowRightLeft, Users } from "lucide-react";

export function Dialer() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const { startCall, endCall, holdCall, resumeCall, activeCalls } = useCallContext();

  const handleStartCall = () => {
    if (phoneNumber.trim()) {
      startCall(phoneNumber);
      setPhoneNumber("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleStartCall();
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Call Input */}
      <div className="space-y-2">
        <Label htmlFor="phoneNumber" className="text-sm font-medium text-gray-700">
          Phone Number
        </Label>
        <div className="flex space-x-2">
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="+1 (555) 123-4567"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            onKeyPress={handleKeyPress}
            className="flex-1"
          />
          <Button
            onClick={handleStartCall}
            disabled={!phoneNumber.trim()}
            className="bg-green-500 hover:bg-green-600 text-white"
          >
            <Phone className="w-4 h-4 mr-2" />
            Call
          </Button>
        </div>
      </div>

      {/* Call Controls */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-900">Call Controls</h3>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              const activeCall = activeCalls.find(call => call.status === 'active');
              if (activeCall) endCall(activeCall.id);
            }}
            disabled={activeCalls.length === 0}
          >
            <PhoneOff className="w-4 h-4 mr-2" />
            Hang Up
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const activeCall = activeCalls.find(call => call.status === 'active');
              if (activeCall) {
                if (activeCall.status === 'active') {
                  holdCall(activeCall.id);
                } else if (activeCall.status === 'held') {
                  resumeCall(activeCall.id);
                }
              }
            }}
            disabled={activeCalls.length === 0}
            className="bg-amber-500 hover:bg-amber-600 text-white border-amber-500"
          >
            <Pause className="w-4 h-4 mr-2" />
            Hold
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={activeCalls.length === 0}
            className="bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
          >
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Transfer
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={activeCalls.length < 2}
            className="bg-purple-500 hover:bg-purple-600 text-white border-purple-500"
          >
            <Users className="w-4 h-4 mr-2" />
            Conference
          </Button>
        </div>
      </div>
    </div>
  );
}
