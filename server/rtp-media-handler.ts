import { WebSocketServer, WebSocket } from 'ws';
import { createServer, type Server } from 'http';
import * as dgram from 'dgram';
import { EventEmitter } from 'events';

interface RTPPacket {
  version: number;
  padding: boolean;
  extension: boolean;
  csrcCount: number;
  marker: boolean;
  payloadType: number;
  sequenceNumber: number;
  timestamp: number;
  ssrc: number;
  payload: Buffer;
}

interface MediaStreamConfig {
  localPort: number;
  remoteHost?: string;
  remotePort?: number;
  codec: 'PCMU' | 'PCMA' | 'G729' | 'G722';
  sampleRate: number;
}

export class RTPMediaHandler extends EventEmitter {
  private udpSocket: dgram.Socket | null = null;
  private wsServer: WebSocketServer | null = null;
  private activeSessions: Map<string, MediaStreamConfig> = new Map();
  private sequenceNumber: number = Math.floor(Math.random() * 65536);
  private timestamp: number = 0;
  private ssrc: number = Math.floor(Math.random() * 0xffffffff);

  constructor(private httpServer: Server) {
    super();
    this.setupWebSocketServer();
  }

  private setupWebSocketServer() {
    this.wsServer = new WebSocketServer({ 
      server: this.httpServer, 
      path: '/ws/rtp-media' 
    });

    this.wsServer.on('connection', (ws) => {
      console.log('RTP Media client connected');

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          await this.handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error('RTP WebSocket message error:', error);
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Invalid message format' 
          }));
        }
      });

      ws.on('close', () => {
        console.log('RTP Media client disconnected');
      });
    });
  }

  private async handleWebSocketMessage(ws: WebSocket, data: any) {
    switch (data.type) {
      case 'start_rtp_stream':
        await this.startRTPStream(ws, data.callId, data.config);
        break;
      
      case 'stop_rtp_stream':
        await this.stopRTPStream(data.callId);
        break;
      
      case 'audio_data':
        await this.sendAudioData(data.callId, data.audioData);
        break;
      
      case 'get_rtp_config':
        await this.sendRTPConfig(ws, data.callId);
        break;
    }
  }

  private async startRTPStream(ws: WebSocket, callId: string, config: MediaStreamConfig) {
    try {
      // Store session config
      this.activeSessions.set(callId, config);

      // Create UDP socket for RTP
      this.udpSocket = dgram.createSocket('udp4');
      
      // Bind to local port
      this.udpSocket.bind(config.localPort, () => {
        console.log(`RTP socket bound to port ${config.localPort}`);
        
        ws.send(JSON.stringify({
          type: 'rtp_stream_started',
          callId,
          localPort: config.localPort,
          codec: config.codec,
          sampleRate: config.sampleRate
        }));
      });

      // Handle incoming RTP packets (audio from remote party)
      this.udpSocket.on('message', (buffer, rinfo) => {
        const rtpPacket = this.parseRTPPacket(buffer);
        if (rtpPacket) {
          // Send audio data to WebSocket client
          ws.send(JSON.stringify({
            type: 'incoming_audio',
            callId,
            audioData: rtpPacket.payload.toString('base64'),
            timestamp: rtpPacket.timestamp,
            sequenceNumber: rtpPacket.sequenceNumber
          }));
        }
      });

      this.udpSocket.on('error', (error) => {
        console.error('RTP socket error:', error);
        ws.send(JSON.stringify({
          type: 'rtp_error',
          callId,
          error: error.message
        }));
      });

    } catch (error) {
      console.error('Failed to start RTP stream:', error);
      ws.send(JSON.stringify({
        type: 'rtp_error',
        callId,
        error: 'Failed to start RTP stream'
      }));
    }
  }

  private async stopRTPStream(callId: string) {
    try {
      if (this.udpSocket) {
        this.udpSocket.close();
        this.udpSocket = null;
      }
      
      this.activeSessions.delete(callId);
      
      // Broadcast stop to all WebSocket clients
      this.wsServer?.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'rtp_stream_stopped',
            callId
          }));
        }
      });

    } catch (error) {
      console.error('Failed to stop RTP stream:', error);
    }
  }

  private async sendAudioData(callId: string, audioData: string) {
    const config = this.activeSessions.get(callId);
    if (!config || !this.udpSocket) {
      return;
    }

    try {
      // Convert base64 audio data to buffer
      const audioBuffer = Buffer.from(audioData, 'base64');
      
      // Create RTP packet
      const rtpPacket = this.createRTPPacket(audioBuffer, config.codec);
      
      // Send RTP packet to remote endpoint
      if (config.remoteHost && config.remotePort) {
        this.udpSocket.send(rtpPacket, config.remotePort, config.remoteHost);
      }

    } catch (error) {
      console.error('Failed to send audio data:', error);
    }
  }

  private async sendRTPConfig(ws: WebSocket, callId: string) {
    const config = this.activeSessions.get(callId);
    ws.send(JSON.stringify({
      type: 'rtp_config',
      callId,
      config: config || null
    }));
  }

  private parseRTPPacket(buffer: Buffer): RTPPacket | null {
    if (buffer.length < 12) return null;

    try {
      const firstByte = buffer.readUInt8(0);
      const secondByte = buffer.readUInt8(1);

      return {
        version: (firstByte >> 6) & 0x03,
        padding: ((firstByte >> 5) & 0x01) === 1,
        extension: ((firstByte >> 4) & 0x01) === 1,
        csrcCount: firstByte & 0x0f,
        marker: ((secondByte >> 7) & 0x01) === 1,
        payloadType: secondByte & 0x7f,
        sequenceNumber: buffer.readUInt16BE(2),
        timestamp: buffer.readUInt32BE(4),
        ssrc: buffer.readUInt32BE(8),
        payload: buffer.slice(12)
      };
    } catch (error) {
      console.error('Failed to parse RTP packet:', error);
      return null;
    }
  }

  private createRTPPacket(audioData: Buffer, codec: string): Buffer {
    const headerSize = 12;
    const packet = Buffer.alloc(headerSize + audioData.length);

    // RTP Header
    packet.writeUInt8(0x80, 0); // Version 2, no padding, no extension, no CSRC
    packet.writeUInt8(this.getPayloadType(codec), 1); // Payload type
    packet.writeUInt16BE(this.sequenceNumber++, 2); // Sequence number
    packet.writeUInt32BE(this.timestamp, 4); // Timestamp
    packet.writeUInt32BE(this.ssrc, 8); // SSRC

    // Copy audio data
    audioData.copy(packet, headerSize);

    // Update timestamp based on sample rate
    this.timestamp += audioData.length;

    return packet;
  }

  private getPayloadType(codec: string): number {
    switch (codec) {
      case 'PCMU': return 0;
      case 'PCMA': return 8; 
      case 'G722': return 9;
      case 'G729': return 18;
      default: return 0;
    }
  }

  public getActiveSessionsCount(): number {
    return this.activeSessions.size;
  }

  public getSessionConfig(callId: string): MediaStreamConfig | undefined {
    return this.activeSessions.get(callId);
  }

  public destroy() {
    if (this.udpSocket) {
      this.udpSocket.close();
    }
    if (this.wsServer) {
      this.wsServer.close();
    }
    this.activeSessions.clear();
  }
}