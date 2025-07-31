import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, Delete, Info } from "lucide-react";
import { useCallContext } from "@/contexts/call-context-stable";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function AudioBridgeDialer() {
  const [number, setNumber] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const { connectionStatus } = useCallContext();

  const handleKeypadClick = (digit: string) => {
    setNumber(prev => prev + digit);
  };

  const handleCall = async () => {
    if (!number.trim()) return;
    
    try {
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          toNumber: number.trim(),
          userPhoneNumber: userPhone.trim() || undefined
        })
      });
      
      if (response.ok) {
        setNumber("");
        if (userPhone) {
          console.log(`🌉 Bridge call initiated - answer your phone (${userPhone}) to connect to ${number}`);
        }
      }
    } catch (error) {
      console.error('Call failed:', error);
    }
  };

  const handleClear = () => {
    setNumber("");
  };

  const canCall = number.trim() && connectionStatus === 'connected';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Phone className="w-5 h-5" />
            Audio Bridge Dialer
          </span>
          <Badge variant={connectionStatus === 'connected' ? "default" : "destructive"}>
            {connectionStatus}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        
        {/* Audio Bridge Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {userPhone ? 
              `Bridge Mode: We'll call ${userPhone} first, then connect to target` :
              "Enter your phone number below for audio bridge mode"
            }
          </AlertDescription>
        </Alert>

        {/* Your Phone Number */}
        <div className="space-y-2">
          <Label htmlFor="userPhone">Your Phone Number (for audio)</Label>
          <Input
            id="userPhone"
            value={userPhone}
            onChange={(e) => setUserPhone(e.target.value)}
            placeholder="+1234567890"
            type="tel"
          />
        </div>

        {/* Target Number */}
        <div className="space-y-2">
          <Label htmlFor="targetNumber">Call To</Label>
          <Input
            id="targetNumber"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Enter phone number"
            className="text-center text-lg font-mono"
            type="tel"
          />
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((digit) => (
            <Button
              key={digit}
              onClick={() => handleKeypadClick(digit)}
              variant="outline"
              size="sm"
              className="aspect-square text-lg font-mono"
            >
              {digit}
            </Button>
          ))}
        </div>

        {/* Call Controls */}
        <div className="flex gap-2">
          <Button
            onClick={handleCall}
            disabled={!canCall}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50"
          >
            <PhoneCall className="w-4 h-4 mr-2" />
            {userPhone ? "Bridge Call" : "Direct Call"}
          </Button>
          <Button onClick={handleClear} variant="outline" size="sm">
            <Delete className="w-4 h-4" />
          </Button>
        </div>

        {/* How it works */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Bridge Mode (Audio Working):</strong></p>
          <p>1. Enter your phone number above</p>
          <p>2. We call your phone first</p>
          <p>3. When you answer, we connect to target</p>
          <p>4. You hear audio through your phone</p>
        </div>
      </CardContent>
    </Card>
  );
}