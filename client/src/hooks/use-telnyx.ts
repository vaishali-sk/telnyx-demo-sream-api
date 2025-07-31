import { useCallContext } from "@/contexts/call-context";

export function useTelnyx() {
  const { telnyxClient, connectionStatus } = useCallContext();

  return {
    telnyxConfig: null, // This will be handled by the call context
    connectionStatus,
    telnyxClient,
  };
}
