import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCallContext } from "@/contexts/call-context";

interface TransferModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransferModal({ open, onOpenChange }: TransferModalProps) {
  const [transferNumber, setTransferNumber] = useState("");
  const { transferCall, activeCalls } = useCallContext();

  const handleTransfer = () => {
    if (transferNumber.trim()) {
      const activeCall = activeCalls.find(call => call.status === 'active');
      if (activeCall) {
        transferCall(activeCall.id, transferNumber);
        setTransferNumber("");
        onOpenChange(false);
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTransfer();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer Call</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="transferNumber">Transfer to Number</Label>
            <Input
              id="transferNumber"
              type="tel"
              placeholder="+1 (555) 123-4567"
              value={transferNumber}
              onChange={(e) => setTransferNumber(e.target.value)}
              onKeyPress={handleKeyPress}
            />
          </div>
          
          <div className="flex space-x-3">
            <Button 
              onClick={handleTransfer}
              disabled={!transferNumber.trim()}
              className="flex-1"
            >
              Transfer
            </Button>
            <Button 
              variant="outline" 
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
