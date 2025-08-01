import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';

interface AudioStream {
  callId: string;
  direction: 'inbound' | 'outbound';
  audioData: Buffer;
  timestamp: number;
}

interface AudioClient {
  ws: WebSocket;
  callId?: string;
  isStreaming: boolean;
}

export class AudioStreamingManager {
  private wss: WebSocketServer;
  private clients: Map<string, AudioClient> = new Map();
  private activeStreams: Map<string, AudioStream[]> = new Map();

  constructor(server: Server) {
    // Create WebSocket server on separate path for audio streaming
    this.wss = new WebSocketServer({ 
      server, 
      path: '/ws/audio',
      perMessageDeflate: false // Disable compression for real-time audio
    });

    this.setupWebSocketHandlers();
  }

  private setupWebSocketHandlers() {
    this.wss.on('connection', (ws: WebSocket, request) => {
      const clientId = this.generateClientId();
      console.log(`Audio client connected: ${clientId}`);
      
      const client: AudioClient = {
        ws,
        isStreaming: false
      };
      
      this.clients.set(clientId, client);

      ws.on('message', (data: Buffer) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleAudioMessage(clientId, message);
        } catch (error) {
          console.error('Failed to parse audio message:', error);
        }
      });

      ws.on('close', () => {
        console.log(`Audio client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (error) => {
        console.error(`Audio WebSocket error for ${clientId}:`, error);
        this.clients.delete(clientId);
      });

      // Send connection acknowledgment
      this.sendToClient(clientId, {
        type: 'connected',
        clientId,
        message: 'Audio streaming connection established'
      });
    });
  }

  private handleAudioMessage(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case 'start_stream':
        this.startAudioStream(clientId, message.callId);
        break;
      
      case 'stop_stream':
        this.stopAudioStream(clientId);
        break;
      
      case 'audio_data':
        this.processAudioData(clientId, message);
        break;
      
      case 'set_call':
        client.callId = message.callId;
        this.sendToClient(clientId, {
          type: 'call_set',
          callId: message.callId
        });
        break;
    }
  }

  private startAudioStream(clientId: string, callId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.callId = callId;
    client.isStreaming = true;

    console.log(`Started audio streaming for call ${callId} (client: ${clientId})`);
    
    this.sendToClient(clientId, {
      type: 'stream_started',
      callId,
      message: 'Audio streaming started'
    });

    // Initialize empty stream buffer for this call
    if (!this.activeStreams.has(callId)) {
      this.activeStreams.set(callId, []);
    }
  }

  private stopAudioStream(clientId: string) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const callId = client.callId;
    client.isStreaming = false;
    client.callId = undefined;

    console.log(`Stopped audio streaming for call ${callId} (client: ${clientId})`);
    
    this.sendToClient(clientId, {
      type: 'stream_stopped',
      message: 'Audio streaming stopped'
    });
  }

  private processAudioData(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (!client || !client.callId || !client.isStreaming) return;

    const audioStream: AudioStream = {
      callId: client.callId,
      direction: message.direction || 'outbound',
      audioData: Buffer.from(message.audioData, 'base64'),
      timestamp: Date.now()
    };

    // Store audio data for this call
    const streams = this.activeStreams.get(client.callId) || [];
    streams.push(audioStream);
    
    // Keep only recent audio data (last 30 seconds)
    const cutoffTime = Date.now() - 30000;
    const recentStreams = streams.filter(stream => stream.timestamp > cutoffTime);
    this.activeStreams.set(client.callId, recentStreams);

    // Broadcast audio to all clients connected to this call
    this.broadcastAudioToCall(client.callId, audioStream, clientId);
  }

  private broadcastAudioToCall(callId: string, audioStream: AudioStream, excludeClientId: string) {
    this.clients.forEach((client, clientId) => {
      if (clientId !== excludeClientId && 
          client.callId === callId && 
          client.isStreaming &&
          client.ws.readyState === WebSocket.OPEN) {
        
        this.sendToClient(clientId, {
          type: 'audio_data',
          callId,
          direction: audioStream.direction,
          audioData: audioStream.audioData.toString('base64'),
          timestamp: audioStream.timestamp
        });
      }
    });
  }

  private sendToClient(clientId: string, message: any) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Public methods for call management integration
  public getActiveStreams(callId: string): AudioStream[] {
    return this.activeStreams.get(callId) || [];
  }

  public endCallStreams(callId: string) {
    // Notify all clients streaming this call
    this.clients.forEach((client, clientId) => {
      if (client.callId === callId) {
        this.sendToClient(clientId, {
          type: 'call_ended',
          callId,
          message: 'Call has ended, stopping audio stream'
        });
        client.isStreaming = false;
        client.callId = undefined;
      }
    });

    // Clear stored audio data for this call
    this.activeStreams.delete(callId);
  }

  public getConnectedClients(): number {
    return this.clients.size;
  }

  public getStreamingClients(): number {
    return Array.from(this.clients.values()).filter(client => client.isStreaming).length;
  }
}