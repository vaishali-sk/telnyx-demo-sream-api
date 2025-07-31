import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, PhoneCall } from "lucide-react";
import { useCallContext } from "@/contexts/telnyx-call-context";

export function DialerNew() {
  const [number, setNumber] = useState("");
  const { startCall, connectionStatus } = useCallContext();

  const handleDial = () => {
    if (number.trim()) {
      startCall(number.trim());
      setNumber("");
    }
  };

  const handleKeyPress = (digit: string) => {
    setNumber(prev => prev + digit);
  };

  const digits = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#']
  ];

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle className="text-center">Dialer</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            placeholder="Enter phone number"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter') {
                handleDial();
              }
            }}
            className="text-center text-lg"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {digits.map((row, rowIndex) => (
            row.map((digit, colIndex) => (
              <Button
                key={`${rowIndex}-${colIndex}`}
                variant="outline"
                className="h-12 text-lg font-semibold"
                onClick={() => handleKeyPress(digit)}
              >
                {digit}
              </Button>
            ))
          ))}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleDial}
            disabled={!number.trim() || connectionStatus !== 'connected'}
            className="flex-1"
            size="lg"
          >
            <Phone className="w-4 h-4 mr-2" />
            Call
          </Button>
          <Button
            variant="outline"
            onClick={() => setNumber("")}
            size="lg"
          >
            Clear
          </Button>
        </div>

        <div className="text-center text-sm text-muted-foreground">
          Status: <span className={`font-medium ${
            connectionStatus === 'connected' ? 'text-green-600' :
            connectionStatus === 'connecting' ? 'text-yellow-600' :
            'text-red-600'
          }`}>
            {connectionStatus === 'connected' ? 'Connected' :
             connectionStatus === 'connecting' ? 'Connecting...' :
             connectionStatus === 'error' ? 'Error' : 'Disconnected'}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}