import { useCallContext } from "@/contexts/api-call-context";
import { cn } from "@/lib/utils";

export function ConnectionStatus() {
  const { connectionStatus } = useCallContext();
  const isConnected = connectionStatus === 'connected';

  return (
    <div className="flex items-center space-x-2">
      <div
        className={cn(
          "w-3 h-3 rounded-full transition-colors",
          isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
        )}
      />
      <span
        className={cn(
          "text-sm font-medium",
          isConnected ? "text-green-600" : "text-red-600"
        )}
      >
        {connectionStatus === 'connecting' ? 'Connecting...' :
         connectionStatus === 'connected' ? 'Connected' :
         connectionStatus === 'error' ? 'Error' : 'Disconnected'}
      </span>
      <span className="text-sm text-gray-500">
        Telnyx Call Control
      </span>
    </div>
  );
}
