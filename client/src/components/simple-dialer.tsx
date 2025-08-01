import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Phone, Delete, PhoneCall } from "lucide-react";
import { useCallContext } from "@/contexts/api-call-context";

export function SimpleDialer() {
  const [number, setNumber] = useState("");
  const { startCall, connectionStatus } = useCallContext();

  const handleKeypadClick = (digit: string) => {
    setNumber(prev => prev + digit);
  };

  const handleCall = async () => {
    if (!number.trim()) return;
    
    try {
      await startCall(number.trim());
      setNumber("");
    } catch (error) {
      console.error('Call failed:', error);
    }
  };

  const handleClear = () => {
    setNumber("");
  };

  const handleBackspace = () => {
    setNumber(prev => prev.slice(0, -1));
  };

  const canCall = number.trim() && connectionStatus === 'connected';
  const keypadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#']
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="w-5 h-5" />
          Phone Dialer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Number Input */}
        <div className="space-y-2">
          <Label htmlFor="number">Destination Number</Label>
          <div className="flex gap-2">
            <Input
              id="number"
              type="tel"
              placeholder="Enter phone number to call"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="font-mono text-lg"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={handleBackspace}
              disabled={!number}
            >
              <Delete className="w-4 h-4" />
            </Button>
          </div>
        </div>



        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {keypadButtons.flat().map((digit) => (
            <Button
              key={digit}
              variant="outline"
              className="aspect-square text-lg font-bold"
              onClick={() => handleKeypadClick(digit)}
            >
              {digit}
            </Button>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleCall}
            disabled={!canCall}
            className="flex-1"
            size="lg"
          >
            <PhoneCall className="w-4 h-4 mr-2" />
            Call
          </Button>
          <Button
            variant="outline"
            onClick={handleClear}
            disabled={!number}
            size="lg"
          >
            Clear
          </Button>
        </div>

        {/* Connection Status */}
        {connectionStatus !== 'connected' && (
          <div className="text-sm text-muted-foreground text-center">
            {connectionStatus === 'connecting' && 'Connecting to Telnyx...'}
            {connectionStatus === 'disconnected' && 'Disconnected from Telnyx'}
            {connectionStatus === 'error' && 'Connection error - check settings'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}