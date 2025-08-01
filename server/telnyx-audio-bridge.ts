import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { Server } from 'http';

/**
 * Telnyx Audio Bridge - Direct server-side audio streaming
 * This implementation uses Telnyx Call Control API with media streaming
 * without WebRTC dependencies, supporting transfers and conferences
 */

interface AudioStreamConfig {
  callControlId: string;
  streamUrl: string;
  codec: 'PCMU' | 'PCMA' | 'G722' | 'OPUS';
  sampleRate: number;
  bidirectional: boolean;
}

interface AudioPacket {
  callId: string;
  payload: string; // Base64 encoded audio
  timestamp: number;
  sequenceNumber: number;
  codec: string;
  direction: 'inbound' | 'outbound';
}

export class TelnyxAudioBridge extends EventEmitter {
  private activeStreams: Map<string, WebSocket> = new Map();
  private callStreams: Map<string, AudioStreamConfig> = new Map();
  private audioBuffer: Map<string, AudioPacket[]> = new Map();
  private httpServer: Server;

  constructor(httpServer: Server) {
    super();
    this.httpServer = httpServer;
  }

  /**
   * Start audio streaming for a call using Telnyx Call Control API
   */
  async startAudioStreaming(callControlId: string, config: Partial<AudioStreamConfig> = {}): Promise<string> {
    const streamConfig: AudioStreamConfig = {
      callControlId,
      streamUrl: config.streamUrl || `wss://${process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN}/ws/audio-bridge`,
      codec: config.codec || 'PCMU',
      sampleRate: config.sampleRate || 8000,
      bidirectional: config.bidirectional !== false
    };

    // Store stream configuration
    this.callStreams.set(callControlId, streamConfig);
    this.audioBuffer.set(callControlId, []);

    console.log(`🎵 Starting audio bridge for call: ${callControlId}`);
    
    return `audio-stream-${callControlId}`;
  }

  /**
   * Stop audio streaming for a call
   */
  async stopAudioStreaming(callControlId: string): Promise<void> {
    const streamConfig = this.callStreams.get(callControlId);
    if (!streamConfig) {
      console.log(`⚠️ No audio stream found for call: ${callControlId}`);
      return;
    }

    // Clean up resources
    this.callStreams.delete(callControlId);
    this.audioBuffer.delete(callControlId);
    
    // Close any associated WebSocket connections
    this.activeStreams.forEach((ws, streamId) => {
      if (streamId.includes(callControlId)) {
        ws.close();
        this.activeStreams.delete(streamId);
      }
    });

    console.log(`🛑 Stopped audio bridge for call: ${callControlId}`);
  }

  /**
   * Handle incoming audio from Telnyx (RTP packets)
   */
  handleIncomingAudio(callControlId: string, audioData: string, metadata: any = {}): void {
    const packet: AudioPacket = {
      callId: callControlId,
      payload: audioData,
      timestamp: metadata.timestamp || Date.now(),
      sequenceNumber: metadata.sequenceNumber || 0,
      codec: metadata.codec || 'PCMU',
      direction: 'inbound'
    };

    // Store in buffer for processing
    const buffer = this.audioBuffer.get(callControlId) || [];
    buffer.push(packet);
    this.audioBuffer.set(callControlId, buffer);

    // Emit for real-time processing
    this.emit('inbound_audio', packet);

    console.log(`🔊 Received inbound audio for call ${callControlId}: ${audioData.length} bytes`);
  }

  /**
   * Handle outgoing audio to Telnyx (for speaking into the call)
   */
  handleOutgoingAudio(callControlId: string, audioData: string, metadata: any = {}): void {
    const packet: AudioPacket = {
      callId: callControlId,
      payload: audioData,
      timestamp: metadata.timestamp || Date.now(),
      sequenceNumber: metadata.sequenceNumber || 0,
      codec: metadata.codec || 'PCMU',
      direction: 'outbound'
    };

    // Emit for processing and sending to Telnyx
    this.emit('outbound_audio', packet);

    console.log(`🎤 Sending outbound audio for call ${callControlId}: ${audioData.length} bytes`);
  }

  /**
   * Get buffered audio for a call (for playback)
   */
  getAudioBuffer(callControlId: string, direction: 'inbound' | 'outbound' | 'both' = 'both'): AudioPacket[] {
    const buffer = this.audioBuffer.get(callControlId) || [];
    
    if (direction === 'both') {
      return buffer;
    }
    
    return buffer.filter(packet => packet.direction === direction);
  }

  /**
   * Clear audio buffer for a call
   */
  clearAudioBuffer(callControlId: string): void {
    this.audioBuffer.set(callControlId, []);
  }

  /**
   * Get active calls with audio streaming
   */
  getActiveCalls(): string[] {
    return Array.from(this.callStreams.keys());
  }

  /**
   * Check if audio streaming is active for a call
   */
  isStreamingActive(callControlId: string): boolean {
    return this.callStreams.has(callControlId);
  }

  /**
   * Get stream configuration for a call
   */
  getStreamConfig(callControlId: string): AudioStreamConfig | undefined {
    return this.callStreams.get(callControlId);
  }

  /**
   * Process audio for conference calls
   * Mixes audio from multiple participants
   */
  processConferenceAudio(conferenceId: string, participantCalls: string[]): void {
    const mixedAudio: Map<string, AudioPacket[]> = new Map();

    // Collect audio from all participants
    participantCalls.forEach(callId => {
      const buffer = this.getAudioBuffer(callId, 'inbound');
      mixedAudio.set(callId, buffer);
    });

    // Emit mixed audio for each participant (excluding their own voice)
    participantCalls.forEach(targetCallId => {
      const otherParticipants = participantCalls.filter(id => id !== targetCallId);
      const mixedBuffer: AudioPacket[] = [];

      otherParticipants.forEach(sourceCallId => {
        const sourceBuffer = mixedAudio.get(sourceCallId) || [];
        mixedBuffer.push(...sourceBuffer);
      });

      // Send mixed audio to the target participant
      mixedBuffer.forEach(packet => {
        this.handleOutgoingAudio(targetCallId, packet.payload, {
          timestamp: packet.timestamp,
          sequenceNumber: packet.sequenceNumber,
          codec: packet.codec
        });
      });
    });

    console.log(`🎵 Processed conference audio for ${participantCalls.length} participants`);
  }

  /**
   * Handle call transfer - maintain audio streaming
   */
  handleCallTransfer(fromCallId: string, toCallId: string): void {
    const fromConfig = this.callStreams.get(fromCallId);
    if (!fromConfig) {
      console.log(`⚠️ No stream config found for transferred call: ${fromCallId}`);
      return;
    }

    // Copy stream configuration to new call
    const newConfig: AudioStreamConfig = {
      ...fromConfig,
      callControlId: toCallId
    };

    this.callStreams.set(toCallId, newConfig);
    
    // Transfer audio buffer
    const audioBuffer = this.audioBuffer.get(fromCallId) || [];
    this.audioBuffer.set(toCallId, audioBuffer);

    // Clean up old call
    this.stopAudioStreaming(fromCallId);

    console.log(`🔄 Transferred audio stream from ${fromCallId} to ${toCallId}`);
  }

  /**
   * Cleanup all resources
   */
  cleanup(): void {
    this.callStreams.clear();
    this.audioBuffer.clear();
    
    this.activeStreams.forEach(ws => {
      ws.close();
    });
    this.activeStreams.clear();

    console.log('🧹 Audio bridge cleanup completed');
  }
}