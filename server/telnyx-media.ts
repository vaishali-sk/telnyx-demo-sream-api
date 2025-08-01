import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import { EventEmitter } from 'events';

interface TelnyxMediaConfig {
  streamUrl: string;
  streamTrack: 'inbound_track' | 'outbound_track' | 'both_tracks';
  streamBidirectionalMode?: 'rtp';
  streamBidirectionalCodec?: 'PCMU' | 'PCMA' | 'G722' | 'OPUS' | 'AMR-WB';
}

interface MediaMessage {
  event: 'media' | 'start' | 'stop' | 'connected' | 'error' | 'dtmf' | 'mark' | 'clear';
  stream_id?: string;
  sequence_number?: string;
  media?: {
    track?: 'inbound' | 'outbound';
    chunk?: string;
    timestamp?: string;
    payload: string;
  };
  start?: {
    user_id: string;
    call_control_id: string;
    call_session_id: string;
    from: string;
    to: string;
    media_format: {
      encoding: string;
      sample_rate: number;
      channels: number;
    };
  };
  stop?: {
    user_id: string;
    call_control_id: string;
  };
  dtmf?: {
    digit: string;
  };
  mark?: {
    name: string;
  };
  error?: {
    code: number;
    title: string;
    detail: string;
  };
}

export class TelnyxMediaHandler extends EventEmitter {
  private wsServer: WebSocketServer | null = null;
  private activeStreams: Map<string, WebSocket> = new Map();
  private streamConfigs: Map<string, TelnyxMediaConfig> = new Map();
  private telnyxConnections: Map<string, WebSocket> = new Map();
  private clientConnections: Set<WebSocket> = new Set();
  private audioBridge: any = null;

  constructor(private httpServer: Server) {
    super();
    this.setupWebSocketServer();
  }

  // Set audio bridge reference for HTTP streaming
  setAudioBridge(audioBridge: any): void {
    this.audioBridge = audioBridge;
    console.log('🔗 Audio bridge connected to media handler');
  }

  private setupWebSocketServer() {
    this.wsServer = new WebSocketServer({ 
      server: this.httpServer, 
      path: '/ws/telnyx-media',
      verifyClient: (info: any) => {
        // Allow all WebSocket connections - both Telnyx and browser clients
        console.log(`🔍 WebSocket connection attempt from: ${info.origin || 'no-origin'} - ${info.req.socket.remoteAddress}`);
        return true;
      }
    });

    console.log('WebSocket server initialized on path: /ws/telnyx-media');
    
    this.wsServer.on('connection', (ws, req) => {
      console.log('🔌 Telnyx Media WebSocket client connected from:', req.socket.remoteAddress);
      
      // Track this client connection
      this.clientConnections.add(ws);
      
      // Determine connection type based on headers and origin
      const userAgent = req.headers['user-agent'] || '';
      const origin = req.headers.origin || '';
      const host = req.headers.host || '';
      
      console.log(`🔍 Connection details: User-Agent: ${userAgent}, Origin: ${origin}, Host: ${host}`);
      
      // Telnyx connections typically come without origin header or with specific user agents
      const isTelnyxConnection = !origin || 
                                userAgent.toLowerCase().includes('telnyx') || 
                                userAgent.toLowerCase().includes('websocket') ||
                                userAgent === '' ||
                                req.socket.remoteAddress?.includes('telnyx');
      
      console.log(`🔍 Connection type detection: isTelnyxConnection=${isTelnyxConnection}`);
      
      if (isTelnyxConnection) {
        // This is likely a Telnyx streaming connection
        const streamId = this.generateStreamId();
        this.activeStreams.set(streamId, ws);
        console.log(`📡 Registered Telnyx streaming connection: ${streamId}`);
        console.log(`📊 Total active Telnyx streams: ${this.activeStreams.size}`);
        
        // Send Telnyx-specific connected event
        ws.send(JSON.stringify({
          event: 'connected',
          version: '1.0.0',
          stream_id: streamId
        }));
      } else {
        // This is a browser client connection
        console.log('🌐 Browser client connected for audio streaming');
        
        // Send browser-specific connected event
        ws.send(JSON.stringify({
          event: 'connected',
          version: '1.0.0',
          client_type: 'browser'
        }));
      }

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString()) as MediaMessage;
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('Telnyx Media WebSocket message error:', error);
          ws.send(JSON.stringify({ 
            event: 'error',
            payload: {
              code: 100003,
              title: 'malformed_frame',
              detail: 'Received frame was not formed correctly'
            }
          }));
        }
      });

      ws.on('close', () => {
        console.log('Telnyx Media WebSocket client disconnected');
        this.clientConnections.delete(ws);
        
        // Clean up any active streams for this connection
        this.cleanupStreamsForConnection(ws);
        
        // Log current active stream count
        console.log(`📊 Active Telnyx streams remaining: ${this.activeStreams.size}`);
      });

      ws.on('error', (error) => {
        console.error('Telnyx Media WebSocket error:', error);
      });
    });
  }

  private async handleWebSocketMessage(ws: WebSocket, data: MediaMessage | any) {
    switch (data.event || data.type) {
      case 'media':
        if (data.media?.payload) {
          // Validate base64 encoding
          if (!this.isValidBase64(data.media.payload)) {
            ws.send(JSON.stringify({
              event: 'error',
              payload: {
                code: 100004,
                title: 'invalid_media',
                detail: 'Media provided was not base64 encoded'
              }
            }));
            return;
          }

          // Forward audio to Telnyx if we have a stream connection
          if (data.stream_id) {
            this.sendAudioToTelnyx(data.stream_id, data.media.payload);
          }
          
          // Forward to HTTP audio bridge for non-WebRTC streaming
          if (this.audioBridge && data.stream_id) {
            // Extract call ID from stream ID or context
            const callId = this.getCallIdFromStreamId(data.stream_id) || data.call_id || 'unknown';
            this.audioBridge.handleIncomingAudio(callId, data.media.payload, {
              timestamp: Date.now(),
              codec: 'PCMU',
              track: data.media.track || 'inbound'
            });
          }

          // Process incoming media from client (microphone audio)
          this.emit('incoming_media', {
            payload: data.media.payload,
            streamId: data.stream_id,
            connection: ws
          });
        }
        break;

      case 'outbound_audio':
        // Handle outbound audio from browser clients
        if (data.payload) {
          console.log('🎤 Received outbound audio from client, length:', data.payload.length);
          
          // Forward to Telnyx as bidirectional media
          this.forwardOutboundAudio(data.payload);
          
          // Send confirmation back to client
          ws.send(JSON.stringify({
            type: 'outbound_audio_sent',
            success: true,
            timestamp: data.timestamp
          }));
        }
        break;

      case 'clear':
        // Clear media queue
        this.emit('clear_media', { connection: ws });
        break;

      case 'mark':
        if (data.mark?.name) {
          // Echo mark back to client
          ws.send(JSON.stringify({
            event: 'mark',
            sequence_number: Date.now().toString(),
            mark: data.mark
          }));
        }
        break;

      default:
        console.log('Unknown media event:', data.event);
    }
  }

  // Send media streaming start event to client
  public async startMediaStream(callControlId: string, config: TelnyxMediaConfig, mediaFormat: any) {
    try {
      // Initialize media stream tracking
      const streamId = await this.initializeMediaStream(callControlId, config);
      
      // Broadcast to all connected clients
      this.wsServer?.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            event: 'start',
            sequence_number: '1',
            start: {
              user_id: 'softphone-user',
              call_control_id: callControlId,
              call_session_id: this.generateSessionId(),
              from: '+1234567890',
              to: '+0987654321',
              media_format: mediaFormat || {
                encoding: 'PCMU',
                sample_rate: 8000,
                channels: 1
              }
            },
            stream_id: streamId
          }));

          this.activeStreams.set(streamId, client);
          this.streamConfigs.set(streamId, config);
        }
      });

      return streamId;
    } catch (error) {
      console.error('Failed to start media stream with Telnyx:', error);
      throw error;
    }
  }

  // Send media data to client (incoming audio from call)
  public sendMediaToClient(streamId: string, audioData: string, track: 'inbound' | 'outbound' = 'inbound') {
    const client = this.activeStreams.get(streamId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        event: 'media',
        sequence_number: Date.now().toString(),
        media: {
          track,
          chunk: '1',
          timestamp: Date.now().toString(),
          payload: audioData
        },
        stream_id: streamId
      }));
    }
  }

  // Send DTMF event to client
  public sendDTMFToClient(streamId: string, digit: string) {
    const client = this.activeStreams.get(streamId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        event: 'dtmf',
        stream_id: streamId,
        occurred_at: new Date().toISOString(),
        sequence_number: Date.now().toString(),
        dtmf: { digit }
      }));
    }
  }

  // Stop media streaming
  public stopMediaStream(streamId: string, callControlId: string) {
    const client = this.activeStreams.get(streamId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({
        event: 'stop',
        sequence_number: Date.now().toString(),
        stop: {
          user_id: 'softphone-user',
          call_control_id: callControlId
        },
        stream_id: streamId
      }));
    }

    this.activeStreams.delete(streamId);
    this.streamConfigs.delete(streamId);
  }

  // Get WebSocket server URL for external streaming
  public getStreamingUrl(): string {
    const protocol = process.env.NODE_ENV === 'production' ? 'wss:' : 'ws:';
    const host = process.env.REPLIT_DOMAIN || 'localhost:5000';
    return `${protocol}//${host}/ws/telnyx-media`;
  }

  // Get streaming configuration for Telnyx API calls
  public getTelnyxStreamingConfig(track: 'inbound_track' | 'outbound_track' | 'both_tracks' = 'both_tracks'): TelnyxMediaConfig {
    return {
      streamUrl: 'wss://ws.telnyx.com/websocket',
      streamTrack: track,
      streamBidirectionalMode: 'rtp',
      streamBidirectionalCodec: 'PCMU'
    };
  }

  // Start media streaming with call (Telnyx handles streaming via their infrastructure)
  private async initializeMediaStream(callControlId: string, config: TelnyxMediaConfig): Promise<string> {
    const streamId = this.generateStreamId();
    
    console.log(`Initializing media stream for call ${callControlId}`);
    
    // For Telnyx, the streaming is handled automatically when stream_url is provided during call creation
    // We just need to track the stream locally
    this.streamConfigs.set(streamId, config);
    
    return streamId;
  }

  // Handle messages from Telnyx
  private handleTelnyxMessage(streamId: string, message: any) {
    const client = this.activeStreams.get(streamId);
    if (client && client.readyState === WebSocket.OPEN) {
      // Forward Telnyx messages to client
      client.send(JSON.stringify(message));
    }
  }

  // Forward incoming audio data from Telnyx to all connected clients
  public sendAudioToTelnyx(streamId: string, audioData: string) {
    console.log(`🎵 Processing audio for stream ${streamId}, length: ${audioData.length}`);
    
    // Forward this audio data to ALL connected clients
    const message = JSON.stringify({
      event: 'media',
      media: {
        payload: audioData,
        stream_id: streamId,
        timestamp: Date.now()
      }
    });
    
    let sentCount = 0;
    this.clientConnections.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
        sentCount++;
      }
    });
    
    console.log(`🔊 Audio forwarded to ${sentCount} connected clients`);
  }

  private cleanupStreamsForConnection(ws: WebSocket) {
    const streamsToDelete: string[] = [];
    
    this.activeStreams.forEach((client, streamId) => {
      if (client === ws) {
        streamsToDelete.push(streamId);
        console.log(`🗑️ Cleaning up stream: ${streamId}`);
      }
    });

    streamsToDelete.forEach(streamId => {
      this.activeStreams.delete(streamId);
      this.streamConfigs.delete(streamId);
    });
    
    console.log(`📊 Cleaned up ${streamsToDelete.length} streams`);
  }

  private isValidBase64(str: string): boolean {
    try {
      return btoa(atob(str)) === str;
    } catch (err) {
      return false;
    }
  }

  private generateStreamId(): string {
    return 'stream_' + Math.random().toString(36).substring(2, 15);
  }

  private generateSessionId(): string {
    return 'session_' + Math.random().toString(36).substring(2, 15);
  }

  public getActiveStreamsCount(): number {
    return this.activeStreams.size;
  }

  public getStreamConfig(streamId: string): TelnyxMediaConfig | undefined {
    return this.streamConfigs.get(streamId);
  }

  // Forward outbound audio from browser to Telnyx via bidirectional streaming
  private forwardOutboundAudio(audioPayload: string) {
    console.log('🎤 Forwarding outbound audio to Telnyx connections, length:', audioPayload.length);
    
    // Send outbound audio to Telnyx via streaming API
    // Note: In Telnyx bidirectional streaming, we need to send media events back through the same WebSocket
    const message = JSON.stringify({
      event: 'media',
      stream_id: this.getCurrentStreamId(),
      media: {
        payload: audioPayload
      }
    });
    
    let sentCount = 0;
    // Send to all active stream connections (these represent Telnyx streaming connections)
    this.activeStreams.forEach((ws, streamId) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
        console.log(`📤 Sent outbound audio to Telnyx stream: ${streamId}`);
      }
    });
    
    console.log(`🎤 Successfully sent outbound audio to ${sentCount} active Telnyx streams`);
  }

  // Get current active stream ID for media forwarding
  private getCurrentStreamId(): string {
    const streamIds = Array.from(this.activeStreams.keys());
    return streamIds.length > 0 ? streamIds[0] : 'default_stream';
  }

  // Check if a WebSocket connection is from Telnyx
  private isTelnyxConnection(ws: WebSocket): boolean {
    // Check if this WebSocket is in our active streams (Telnyx connections)
    return Array.from(this.activeStreams.values()).includes(ws);
  }

  public destroy() {
    if (this.wsServer) {
      this.wsServer.close();
    }
    this.activeStreams.clear();
    this.streamConfigs.clear();
  }
}