import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useCallContext } from "@/contexts/api-call-context";
import { useTelnyxMedia } from "@/hooks/use-telnyx-media";
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
  User,
  Radio,
  RadioIcon
} from "lucide-react";

interface CallInterfaceProps {
  currentCall?: Call;
}

export function CallInterface({ currentCall }: CallInterfaceProps) {
  const { endCall } = useCallContext();
  const telnyxMedia = useTelnyxMedia(currentCall?.callId);
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
              setIsMuted(!isMuted);
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
              if (telnyxMedia.isStreaming) {
                telnyxMedia.stopMediaStream();
              } else {
                telnyxMedia.startMediaStream();
              }
            }}
            className="p-4 flex flex-col items-center space-y-2 h-auto"
          >
            {telnyxMedia.isStreaming ? (
              <Radio className="w-6 h-6 text-green-500" />
            ) : (
              <RadioIcon className="w-6 h-6 text-gray-600" />
            )}
            <span className="text-xs text-gray-600">
              {telnyxMedia.isStreaming ? 'Audio On' : 'Audio Off'}
            </span>
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

        {/* Telnyx Media Status */}
        {telnyxMedia.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">Audio Error: {telnyxMedia.error}</p>
          </div>
        )}
        
        {telnyxMedia.isStreaming && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Radio className="w-4 h-4 text-green-600" />
                <span className="text-sm text-green-700">Telnyx Media Streaming Active</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-xs text-green-600">Audio Level:</span>
                <div className="w-16 h-2 bg-green-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-green-500 transition-all duration-100"
                    style={{ width: `${telnyxMedia.audioLevel}%` }}
                  />
                </div>
                <span className="text-xs text-green-600">{telnyxMedia.audioLevel}%</span>
              </div>
            </div>
            {telnyxMedia.mediaFormat && (
              <div className="mt-2 text-xs text-green-600">
                Codec: {telnyxMedia.mediaFormat.encoding} • Sample Rate: {telnyxMedia.mediaFormat.sample_rate}Hz • Channels: {telnyxMedia.mediaFormat.channels}
                {telnyxMedia.streamId && ` • Stream: ${telnyxMedia.streamId.substring(0, 8)}...`}
              </div>
            )}
          </div>
        )}

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
