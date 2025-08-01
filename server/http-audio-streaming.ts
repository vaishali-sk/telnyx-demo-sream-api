import { Express } from 'express';
import { TelnyxAudioBridge } from './telnyx-audio-bridge';
import { TelnyxClient } from './telnyx-client';

/**
 * HTTP Audio Streaming API - No WebRTC required
 * This provides REST endpoints for audio streaming without WebRTC dependencies
 */

export function setupHttpAudioStreaming(
  app: Express, 
  audioBridge: TelnyxAudioBridge, 
  telnyxClient: TelnyxClient
) {

  // Start audio streaming for a call
  app.post('/api/calls/:callId/start-audio-stream', async (req, res) => {
    try {
      const { callId } = req.params;
      const { codec = 'PCMU', bidirectional = true } = req.body;

      console.log(`🎵 Starting HTTP audio stream for call: ${callId}`);

      // Start Telnyx media streaming
      await telnyxClient.startMediaStreaming(callId, 'both_tracks', codec);

      // Start our audio bridge
      const streamId = await audioBridge.startAudioStreaming(callId, {
        codec,
        bidirectional
      });

      res.json({
        success: true,
        streamId,
        message: 'Audio streaming started',
        endpoints: {
          inbound: `/api/calls/${callId}/audio/inbound`,
          outbound: `/api/calls/${callId}/audio/outbound`,
          status: `/api/calls/${callId}/audio/status`
        }
      });

    } catch (error) {
      console.error('Failed to start audio streaming:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start audio streaming'
      });
    }
  });

  // Stop audio streaming for a call
  app.post('/api/calls/:callId/stop-audio-stream', async (req, res) => {
    try {
      const { callId } = req.params;

      console.log(`🛑 Stopping HTTP audio stream for call: ${callId}`);

      // Stop Telnyx media streaming
      await telnyxClient.stopMediaStreaming(callId);

      // Stop our audio bridge
      await audioBridge.stopAudioStreaming(callId);

      res.json({
        success: true,
        message: 'Audio streaming stopped'
      });

    } catch (error) {
      console.error('Failed to stop audio streaming:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop audio streaming'
      });
    }
  });

  // Get inbound audio stream (audio from the remote party)
  app.get('/api/calls/:callId/audio/inbound', (req, res) => {
    try {
      const { callId } = req.params;
      const { format = 'raw', since } = req.query;

      if (!audioBridge.isStreamingActive(callId)) {
        return res.status(404).json({
          success: false,
          message: 'No active audio stream for this call'
        });
      }

      const audioBuffer = audioBridge.getAudioBuffer(callId, 'inbound');
      
      // Filter by timestamp if 'since' parameter provided
      let filteredBuffer = audioBuffer;
      if (since) {
        const sinceTimestamp = parseInt(since as string);
        filteredBuffer = audioBuffer.filter(packet => packet.timestamp > sinceTimestamp);
      }

      if (format === 'json') {
        res.json({
          success: true,
          packets: filteredBuffer,
          count: filteredBuffer.length
        });
      } else {
        // Return raw audio data
        const audioData = filteredBuffer.map(packet => packet.payload).join('');
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('X-Audio-Codec', 'PCMU');
        res.setHeader('X-Packet-Count', filteredBuffer.length.toString());
        res.send(Buffer.from(audioData, 'base64'));
      }

    } catch (error) {
      console.error('Failed to get inbound audio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get inbound audio'
      });
    }
  });

  // Send outbound audio (speak into the call)
  app.post('/api/calls/:callId/audio/outbound', (req, res) => {
    try {
      const { callId } = req.params;
      const { audioData, codec = 'PCMU', timestamp } = req.body;

      if (!audioBridge.isStreamingActive(callId)) {
        return res.status(404).json({
          success: false,
          message: 'No active audio stream for this call'
        });
      }

      // Handle outbound audio
      audioBridge.handleOutgoingAudio(callId, audioData, {
        codec,
        timestamp: timestamp || Date.now()
      });

      res.json({
        success: true,
        message: 'Audio sent successfully'
      });

    } catch (error) {
      console.error('Failed to send outbound audio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send outbound audio'
      });
    }
  });

  // Get audio streaming status
  app.get('/api/calls/:callId/audio/status', (req, res) => {
    try {
      const { callId } = req.params;
      
      const isActive = audioBridge.isStreamingActive(callId);
      const config = audioBridge.getStreamConfig(callId);
      const buffer = audioBridge.getAudioBuffer(callId);

      res.json({
        success: true,
        isActive,
        config,
        stats: {
          totalPackets: buffer.length,
          inboundPackets: buffer.filter(p => p.direction === 'inbound').length,
          outboundPackets: buffer.filter(p => p.direction === 'outbound').length,
          lastActivity: buffer.length > 0 ? Math.max(...buffer.map(p => p.timestamp)) : null
        }
      });

    } catch (error) {
      console.error('Failed to get audio status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get audio status'
      });
    }
  });

  // Conference audio mixing
  app.post('/api/conferences/:conferenceId/audio/mix', (req, res) => {
    try {
      const { conferenceId } = req.params;
      const { participantCalls } = req.body;

      if (!Array.isArray(participantCalls)) {
        return res.status(400).json({
          success: false,
          message: 'participantCalls must be an array of call IDs'
        });
      }

      audioBridge.processConferenceAudio(conferenceId, participantCalls);

      res.json({
        success: true,
        message: 'Conference audio mixed successfully',
        participants: participantCalls.length
      });

    } catch (error) {
      console.error('Failed to mix conference audio:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to mix conference audio'
      });
    }
  });

  // Get all active audio streams
  app.get('/api/audio/streams', (req, res) => {
    try {
      const activeCalls = audioBridge.getActiveCalls();
      const streams = activeCalls.map(callId => ({
        callId,
        config: audioBridge.getStreamConfig(callId),
        isActive: audioBridge.isStreamingActive(callId)
      }));

      res.json({
        success: true,
        streams,
        count: streams.length
      });

    } catch (error) {
      console.error('Failed to get audio streams:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get audio streams'
      });
    }
  });

  console.log('🎵 HTTP Audio Streaming API endpoints configured');
}