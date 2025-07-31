import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useCallContext } from "@/contexts/call-context";
import { type Call } from "@shared/schema";
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  MoreHorizontal,
  Plus,
  User
} from "lucide-react";

interface CallInterfaceProps {
  currentCall?: Call;
}

export function CallInterface({ currentCall }: CallInterfaceProps) {
  const { endCall, activeCalls, muteCall, unmuteCall } = useCallContext();
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [callDuration, setCallDuration] = useState("00:00");

  useEffect(() => {
    if (!currentCall || !currentCall.startTime) return;

    const updateDuration = () => {
      const start = new Date(currentCall.startTime!);
      const now = new Date();
      const diff = Math.floor((now.getTime() - start.getTime()) / 1000);
      
      const minutes = Math.floor(diff / 60);
      const seconds = diff % 60;
      setCallDuration(`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
    };

    updateDuration();
    const interval = setInterval(updateDuration, 1000);

    return () => clearInterval(interval);
  }, [currentCall]);

  if (!currentCall) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <Phone className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Active Call</h2>
          <p className="text-gray-500">Use the dialer to start a call</p>
        </div>
      </div>
    );
  }

  const getStatusText = () => {
    switch (currentCall.status) {
      case 'ringing':
        return 'Ringing...';
      case 'active':
        return 'Connected';
      case 'held':
        return 'On Hold';
      default:
        return currentCall.status;
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl">
        {/* Current Call Display */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4 flex items-center justify-center">
            <User className="w-12 h-12 text-gray-400" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            {currentCall.toNumber}
          </h2>
          <p className="text-gray-500 mb-1">{getStatusText()}</p>
          <p className="text-sm text-gray-400">{callDuration}</p>
        </div>

        {/* Call Controls */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              if (isMuted) {
                unmuteCall();
                setIsMuted(false);
              } else {
                muteCall();
                setIsMuted(true);
              }
            }}
            className="p-4 flex flex-col items-center space-y-2 h-auto"
          >
            {isMuted ? (
              <MicOff className="w-6 h-6 text-red-500" />
            ) : (
              <Mic className="w-6 h-6 text-gray-600" />
            )}
            <span className="text-xs text-gray-600">
              {isMuted ? 'Unmute' : 'Mute'}
            </span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              // Manually enable audio playback
              const audioElement = document.getElementById('telnyx-remote-audio') as HTMLAudioElement;
              if (audioElement) {
                audioElement.play().then(() => {
                  console.log('✅ Manual audio enable successful');
                  setIsSpeaker(true);
                }).catch(console.error);
              }
              setIsSpeaker(!isSpeaker);
            }}
            className="p-4 flex flex-col items-center space-y-2 h-auto"
          >
            {isSpeaker ? (
              <Volume2 className="w-6 h-6 text-blue-500" />
            ) : (
              <VolumeX className="w-6 h-6 text-gray-600" />
            )}
            <span className="text-xs text-gray-600">Speaker</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="p-4 flex flex-col items-center space-y-2 h-auto"
          >
            <MoreHorizontal className="w-6 h-6 text-gray-600" />
            <span className="text-xs text-gray-600">Keypad</span>
          </Button>

          <Button
            variant="outline"
            size="lg"
            className="p-4 flex flex-col items-center space-y-2 h-auto"
          >
            <Plus className="w-6 h-6 text-gray-600" />
            <span className="text-xs text-gray-600">Add Call</span>
          </Button>
        </div>

        {/* Primary Action Button */}
        <div className="flex justify-center">
          <Button
            size="lg"
            onClick={() => endCall(currentCall.id)}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 p-0"
          >
            <PhoneOff className="w-8 h-8 text-white" />
          </Button>
        </div>
      </div>
    </div>
  );
}
