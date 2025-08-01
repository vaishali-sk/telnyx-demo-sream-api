import WebSocket from 'ws';

interface TelnyxMediaSession {
  callId: string;
  mediaWs?: WebSocket;
  isConnected: boolean;
  streamId?: string;
}

export class TelnyxMediaManager {
  private sessions = new Map<string, TelnyxMediaSession>();
  private config: any;

  constructor(config: any) {
    this.config = config;
  }

  async startMediaSession(callId: string): Promise<void> {
    console.log(`Starting Telnyx media session for call: ${callId}`);
    
    try {
      // Get call details to find media session info
      const callResponse = await fetch(`https://api.telnyx.com/v2/calls/${callId}`, {
        headers: {
          'Authorization': `Bearer ${this.config.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!callResponse.ok) {
        throw new Error(`Failed to get call details: ${callResponse.statusText}`);
      }

      const callData = await callResponse.json();
      console.log('Call data for media:', callData);

      // For Telnyx, we need to enable media streaming on the call
      const mediaResponse = await fetch(`https://api.telnyx.com/v2/calls/${callId}/actions/streaming_start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          stream_url: `wss://${process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/ws/media`,
          stream_track: 'both', // inbound and outbound audio
          enable_bidirectional_streaming: true
        }),
      });

      if (!mediaResponse.ok) {
        const errorText = await mediaResponse.text();
        console.error('Media streaming start failed:', errorText);
        throw new Error(`Failed to start media streaming: ${mediaResponse.statusText}`);
      }

      const mediaData = await mediaResponse.json();
      console.log('Media streaming started:', mediaData);

      // Create session record
      const session: TelnyxMediaSession = {
        callId,
        isConnected: false,
        streamId: mediaData.data?.stream_id
      };

      this.sessions.set(callId, session);

    } catch (error) {
      console.error('Error starting media session:', error);
      throw error;
    }
  }

  async stopMediaSession(callId: string): Promise<void> {
    console.log(`Stopping media session for call: ${callId}`);
    
    const session = this.sessions.get(callId);
    if (!session) return;

    try {
      // Stop media streaming
      await fetch(`https://api.telnyx.com/v2/calls/${callId}/actions/streaming_stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
      });

      // Close WebSocket if connected
      if (session.mediaWs) {
        session.mediaWs.close();
      }

      this.sessions.delete(callId);
      console.log('Media session stopped successfully');

    } catch (error) {
      console.error('Error stopping media session:', error);
    }
  }

  handleMediaWebSocket(ws: WebSocket, callId: string): void {
    const session = this.sessions.get(callId);
    if (!session) {
      console.error('No media session found for call:', callId);
      ws.close();
      return;
    }

    session.mediaWs = ws;
    session.isConnected = true;

    ws.on('open', () => {
      console.log('Telnyx media WebSocket connected for call:', callId);
    });

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMediaMessage(callId, message);
      } catch (error) {
        console.error('Error parsing media message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Telnyx media WebSocket closed for call:', callId);
      if (session) {
        session.isConnected = false;
        session.mediaWs = undefined;
      }
    });

    ws.on('error', (error) => {
      console.error('Telnyx media WebSocket error:', error);
    });
  }

  private handleMediaMessage(callId: string, message: any): void {
    console.log('Received Telnyx media message:', message.event);
    
    switch (message.event) {
      case 'connected':
        console.log('Telnyx media stream connected');
        break;
        
      case 'start':
        console.log('Telnyx media stream started');
        break;
        
      case 'media':
        // This is the actual audio data from Telnyx
        this.handleIncomingAudio(callId, message);
        break;
        
      case 'stop':
        console.log('Telnyx media stream stopped');
        break;
    }
  }

  private handleIncomingAudio(callId: string, mediaMessage: any): void {
    // Forward audio data to connected desktop client
    // This would be handled by the WebSocket audio server
    console.log('Received audio data for call:', callId, 'payload size:', mediaMessage.media?.payload?.length || 0);
    
    // TODO: Forward to desktop audio WebSocket
    // This requires integration with the WebSocket audio server
  }

  sendAudioToTelnyx(callId: string, audioData: string): void {
    const session = this.sessions.get(callId);
    if (!session?.mediaWs || !session.isConnected) {
      console.error('No connected media session for call:', callId);
      return;
    }

    // Send audio to Telnyx media stream
    const mediaMessage = {
      event: 'media',
      streamSid: session.streamId,
      media: {
        track: 'outbound',
        chunk: '1',
        timestamp: Date.now().toString(),
        payload: audioData
      }
    };

    session.mediaWs.send(JSON.stringify(mediaMessage));
  }

  getSession(callId: string): TelnyxMediaSession | undefined {
    return this.sessions.get(callId);
  }

  getAllSessions(): Map<string, TelnyxMediaSession> {
    return this.sessions;
  }
}