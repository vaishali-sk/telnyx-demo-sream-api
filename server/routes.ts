import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { insertCallSchema, insertTelnyxConfigSchema } from "@shared/schema";
import { telnyxClient } from "./telnyx-client.ts";
import { TelnyxMediaHandler } from "./telnyx-media.ts";
import { TelnyxAudioBridge } from "./telnyx-audio-bridge.ts";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  
  // Initialize Telnyx Media Handler for official WebSocket streaming
  console.log('Initializing Telnyx Media Handler...');
  const telnyxMediaHandler = new TelnyxMediaHandler(httpServer);
  console.log('Telnyx Media Handler initialized successfully');

  // Initialize HTTP Audio Bridge (non-WebRTC solution)
  console.log('Initializing HTTP Audio Bridge...');
  const audioBridge = new TelnyxAudioBridge(httpServer);
  console.log('HTTP Audio Bridge initialized successfully');

  // Connect audio bridge to media handler for audio forwarding
  telnyxMediaHandler.setAudioBridge(audioBridge);

  // Helper functions
  const getCallControlId = (metadata: any): string | undefined => metadata?.telnyxCallControlId;
  const updateMetadata = (existing: any, updates: any): any => ({ ...existing, ...updates });

  // Add debug endpoint for WebSocket testing
  app.get("/debug-ws", (req, res) => {
    res.sendFile(path.join(process.cwd(), 'debug-websocket.html'));
  });

  // Add WebSocket connection test endpoint
  app.get("/api/ws-test", (req, res) => {
    res.json({
      wsUrl: `ws://${req.get('host')}/ws/telnyx-media`,
      host: req.get('host'),
      protocol: req.protocol,
      port: process.env.PORT || '5000'
    });
  });

  app.get("/api/calls", async (req, res) => {
    try {
      const calls = await storage.getCalls();
      res.json(calls);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch calls" });
    }
  });

  app.post("/api/calls", async (req, res) => {
    try {
      const { toNumber, fromNumber, userPhoneNumber } = req.body;
      
      let telnyxCall;
      
      // Get streaming configuration for Telnyx media
      const streamingConfig = telnyxMediaHandler.getTelnyxStreamingConfig('both_tracks');
      
      // If user provides their phone number, use bridge mode for audio
      if (userPhoneNumber) {
        console.log(`🌉 Bridge mode: ${userPhoneNumber} -> ${toNumber}`);
        telnyxCall = await telnyxClient.createBridgedCall(toNumber, userPhoneNumber);
      } else {
        // Standard call with media streaming support
        telnyxCall = await telnyxClient.createCall(toNumber, fromNumber);
      }
      
      if (!telnyxCall) {
        throw new Error('Failed to create Telnyx call');
      }
      
      // Store call record in database
      const call = await storage.createCall({
        callId: telnyxCall.call_control_id,
        fromNumber: telnyxCall.from,
        toNumber: telnyxCall.to,
        status: 'ringing',
        metadata: {
          telnyxCallControlId: telnyxCall.call_control_id,
          telnyxCallSessionId: telnyxCall.call_session_id,
          direction: telnyxCall.direction,
          bridgeMode: !!userPhoneNumber,
          userPhoneNumber: userPhoneNumber || null,
          mediaStreaming: false,
          streamId: null,
          streamingConfig: null
        }
      });

      if (userPhoneNumber) {
        console.log(`📱 Bridge call created - answer your phone (${userPhoneNumber}) to complete call to ${toNumber}`);
      }
      
      res.json(call);
    } catch (error) {
      console.error('Failed to create call:', error);
      res.status(400).json({ message: "Failed to create call" });
    }
  });

  app.patch("/api/calls/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }
      
      // Handle Telnyx call control actions
      if (updates.action) {
        switch (updates.action) {
          case 'answer':
            await telnyxClient.answerCall(callControlId);
            updates.status = 'active';
            break;
          case 'hangup':
            await telnyxClient.hangupCall(callControlId);
            updates.status = 'ended';
            updates.endTime = new Date();
            break;
          case 'hold':
            await telnyxClient.holdCall(callControlId);
            updates.status = 'held';
            break;
          case 'unhold':
            await telnyxClient.unholdCall(callControlId);
            updates.status = 'active';
            break;
          case 'mute':
            await telnyxClient.muteCall(callControlId);
            break;
          case 'unmute':
            await telnyxClient.unmuteCall(callControlId);
            break;
        }
        delete updates.action;
      }
      
      const updatedCall = await storage.updateCall(id, updates);
      res.json(updatedCall);
    } catch (error) {
      console.error('Failed to update call:', error);
      res.status(500).json({ message: "Failed to update call" });
    }
  });

  app.delete("/api/calls/:id", async (req, res) => {
    try {
      const { id } = req.params;
      
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }
      
      const callControlId = getCallControlId(call.metadata);
      if (callControlId && call.status !== 'ended') {
        try {
          await telnyxClient.hangupCall(callControlId);
        } catch (telnyxError) {
          console.error('Failed to hangup Telnyx call:', telnyxError);
        }
      }
      
      const deleted = await storage.deleteCall(id);
      res.json({ message: "Call deleted" });
    } catch (error) {
      res.status(500).json({ message: "Failed to delete call" });
    }
  });

  // Telnyx webhook endpoint for call status updates
  app.post("/webhooks/calls", async (req, res) => {
    try {
      console.log('🔔 Telnyx webhook received:', JSON.stringify(req.body, null, 2));
      
      const webhookData = req.body.data || req.body;
      const { event_type, payload } = webhookData;
      
      console.log(`📞 Webhook event: ${event_type}`);
      
      if (payload && payload.call_control_id) {
        const call = await storage.getCallByCallId(payload.call_control_id);
        
        if (call) {
          let statusUpdate: any = {};
          
          switch (event_type) {
            case 'call.initiated':
              statusUpdate.status = 'ringing';
              console.log(`📞 Call initiated: ${payload.call_control_id}`);
              break;
            case 'call.answered':
              statusUpdate.status = 'active';
              console.log(`📞 Call answered: ${payload.call_control_id}`);
              break;
            case 'call.hangup':
              statusUpdate.status = 'ended';
              statusUpdate.endTime = new Date();
              console.log(`📞 Call ended: ${payload.call_control_id}`);
              break;
            case 'call.bridged':
              statusUpdate.status = 'active';
              console.log(`📞 Call bridged: ${payload.call_control_id}`);
              break;
            case 'call.streaming.started':
            case 'streaming.started':
              statusUpdate.metadata = updateMetadata(call.metadata, { 
                mediaStreaming: true,
                streamId: payload.stream_id,
                streamingStarted: new Date().toISOString()
              });
              console.log(`🎵 Media streaming started: ${payload.call_control_id}, stream ID: ${payload.stream_id}`);
              break;
            case 'call.streaming.stopped':
            case 'streaming.stopped':
              statusUpdate.metadata = updateMetadata(call.metadata, { 
                mediaStreaming: false,
                streamingStopped: new Date().toISOString()
              });
              console.log(`🎵 Media streaming stopped: ${payload.call_control_id}`);
              break;
          }
          
          if (Object.keys(statusUpdate).length > 0) {
            await storage.updateCall(call.id, statusUpdate);
            console.log(`✅ Updated call ${call.id} status to: ${statusUpdate.status || 'metadata updated'}`);
          }
        } else {
          console.log(`⚠️ Call not found for control ID: ${payload.call_control_id}`);
        }
      }
      
      res.status(200).json({ received: true });
    } catch (error) {
      console.error('❌ Webhook processing error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  app.get("/api/telnyx-config", async (req, res) => {
    try {
      const config = await storage.getTelnyxConfig();
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch Telnyx config" });
    }
  });

  app.post("/api/telnyx-config", async (req, res) => {
    try {
      const config = insertTelnyxConfigSchema.parse(req.body);
      const savedConfig = await storage.createOrUpdateTelnyxConfig(config);
      res.json(savedConfig);
    } catch (error) {
      res.status(400).json({ message: "Invalid Telnyx config data" });
    }
  });

  app.post("/api/telnyx-test", async (req, res) => {
    try {
      const isConnected = await telnyxClient.testConnection();

      console.log("==========isConnected", isConnected)
      if (isConnected) {
        res.json({ success: true, message: "Telnyx connection successful" });
      } else {
        res.status(400).json({ success: false, message: "Failed to connect to Telnyx" });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to test connection" });
    }
  });

  // Transfer endpoint
  app.post("/api/calls/:id/transfer", async (req, res) => {
    try {
      const { id } = req.params;
      const { to, type = 'blind' } = req.body;

      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      await telnyxClient.blindTransfer(callControlId, to);
      await storage.updateCall(id, { 
        status: 'ended',
        endTime: new Date(),
        metadata: updateMetadata(call.metadata, { transferredTo: to })
      });

      res.json({ success: true, message: "Transfer initiated" });
    } catch (error) {
      console.error('Transfer failed:', error);
      res.status(500).json({ message: "Transfer failed" });
    }
  });

  // Conference endpoints
  app.post("/api/conferences", async (req, res) => {
    try {
      const { name } = req.body;
      const conferenceName = name || `conf_${Date.now()}`;
      
      const conference = await telnyxClient.createConference(conferenceName);
      
      res.json({
        id: conference.id,
        name: conferenceName,
        status: 'created'
      });
    } catch (error) {
      console.error('Failed to create conference:', error);
      res.status(500).json({ message: "Failed to create conference" });
    }
  });

  // Start media streaming for a call
  app.post("/api/calls/:id/start-media-stream", async (req, res) => {
    try {
      const { id } = req.params;
      const { track = 'both_tracks', codec = 'PCMU' } = req.body;
      
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      try {
        console.log(`🔄 Starting bidirectional streaming for call: ${callControlId}`);
        
        // Start bidirectional media streaming via Telnyx API
        const response = await telnyxClient.startBidirectionalMediaStreaming(callControlId, track, codec);
        console.log('✅ Bidirectional streaming started:', response);
        
        // Wait for Telnyx to connect to our WebSocket
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check if Telnyx connected
        const activeStreams = telnyxMediaHandler.getActiveStreamsCount();
        console.log(`📊 Active Telnyx streams after starting: ${activeStreams}`);
        
        // Update call metadata
        await storage.updateCall(id, {
          metadata: updateMetadata(call.metadata, {
            mediaStreaming: true,
            streamingConfig: { track, codec },
            streamingStarted: new Date().toISOString(),
            telnyxResponse: response
          })
        });

        res.json({
          success: true,
          message: 'Media streaming started',
          streamingUrl: `wss://${process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000'}/ws/telnyx-media`,
          streamId: response.stream_id || 'pending',
          activeStreams: activeStreams,
          telnyxResponse: response
        });
        
        console.log(`🎵 Media streaming started for call ${callControlId} - Active streams: ${activeStreams}`);
        
      } catch (telnyxError) {
        console.error('Telnyx media streaming error:', telnyxError);
        console.error('Error details:', JSON.stringify(telnyxError, null, 2));
        res.status(500).json({ 
          success: false, 
          message: 'Failed to start media streaming via Telnyx',
          error: telnyxError 
        });
      }
      
    } catch (error) {
      console.error('Start media streaming error:', error);
      res.status(500).json({ message: "Failed to start media streaming" });
    }
  });

  app.post("/api/calls/:id/join-conference", async (req, res) => {
    try {
      const { id } = req.params;
      const { conferenceName } = req.body;

      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      await telnyxClient.joinConference(callControlId, conferenceName);
      await storage.updateCall(id, { 
        status: 'conference',
        metadata: updateMetadata(call.metadata, { conferenceName })
      });

      res.json({ success: true, message: "Joined conference" });
    } catch (error) {
      console.error('Failed to join conference:', error);
      res.status(500).json({ message: "Failed to join conference" });
    }
  });

  // ============ HTTP AUDIO STREAMING ENDPOINTS (Non-WebRTC) ============

  // Start HTTP audio streaming for a call
  app.post("/api/calls/:callId/start-http-audio", async (req, res) => {
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
        message: 'HTTP audio streaming started',
        endpoints: {
          inbound: `/api/calls/${callId}/audio/inbound`,
          outbound: `/api/calls/${callId}/audio/outbound`,
          status: `/api/calls/${callId}/audio/status`
        }
      });

    } catch (error) {
      console.error('Failed to start HTTP audio streaming:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to start HTTP audio streaming'
      });
    }
  });

  // Stop HTTP audio streaming for a call
  app.post("/api/calls/:callId/stop-http-audio", async (req, res) => {
    try {
      const { callId } = req.params;

      console.log(`🛑 Stopping HTTP audio stream for call: ${callId}`);

      // Stop Telnyx media streaming
      await telnyxClient.stopMediaStreaming(callId);

      // Stop our audio bridge
      await audioBridge.stopAudioStreaming(callId);

      res.json({
        success: true,
        message: 'HTTP audio streaming stopped'
      });

    } catch (error) {
      console.error('Failed to stop HTTP audio streaming:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to stop HTTP audio streaming'
      });
    }
  });

  // Get inbound audio stream (audio from the remote party)
  app.get("/api/calls/:callId/audio/inbound", (req, res) => {
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
  app.post("/api/calls/:callId/audio/outbound", (req, res) => {
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
  app.get("/api/calls/:callId/audio/status", (req, res) => {
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

  // Recording endpoints
  app.post("/api/calls/:id/start-recording", async (req, res) => {
    try {
      const { id } = req.params;
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      const recording = await telnyxClient.startRecording(callControlId);
      await storage.updateCall(id, { 
        metadata: updateMetadata(call.metadata, { 
          recordingId: recording.recording_id, 
          isRecording: true 
        })
      });

      res.json({ success: true, recordingId: recording.recording_id });
    } catch (error) {
      console.error('Failed to start recording:', error);
      res.status(500).json({ message: "Failed to start recording" });
    }
  });

  app.post("/api/calls/:id/stop-recording", async (req, res) => {
    try {
      const { id } = req.params;
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      await telnyxClient.stopRecording(callControlId);
      await storage.updateCall(id, { 
        metadata: updateMetadata(call.metadata, { isRecording: false })
      });

      res.json({ success: true, message: "Recording stopped" });
    } catch (error) {
      console.error('Failed to stop recording:', error);
      res.status(500).json({ message: "Failed to stop recording" });
    }
  });

  // DTMF endpoint
  app.post("/api/calls/:id/dtmf", async (req, res) => {
    try {
      const { id } = req.params;
      const { digits } = req.body;
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      await telnyxClient.sendDTMF(callControlId, digits);
      res.json({ success: true, message: "DTMF sent" });
    } catch (error) {
      console.error('Failed to send DTMF:', error);
      res.status(500).json({ message: "Failed to send DTMF" });
    }
  });

  // Telnyx Media Streaming endpoints (official WebSocket streaming)
  app.post("/api/calls/:id/start-media-stream", async (req, res) => {
    try {
      const { id } = req.params;
      const { track = 'both_tracks', codec = 'PCMU' } = req.body;
      
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call" });
      }

      // Get Telnyx streaming configuration
      const streamingConfig = telnyxMediaHandler.getTelnyxStreamingConfig(track);
      
      // Start media stream
      const streamId = await telnyxMediaHandler.startMediaStream(callControlId, streamingConfig, {
        encoding: codec,
        sample_rate: 8000,
        channels: 1
      });

      // Update call metadata with streaming info
      await storage.updateCall(id, { 
        metadata: updateMetadata(call.metadata, { 
          mediaStreaming: true,
          streamId,
          streamingConfig 
        })
      });

      res.json({ 
        success: true, 
        message: "Media streaming started",
        streamId,
        streamingUrl: streamingConfig.streamUrl,
        callId: call.callId
      });
    } catch (error) {
      console.error('Failed to start media stream:', error);
      res.status(500).json({ message: "Failed to start media stream" });
    }
  });

  app.post("/api/calls/:id/stop-media-stream", async (req, res) => {
    try {
      const { id } = req.params;
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = getCallControlId(call.metadata);
      const streamId = (call.metadata as any)?.streamId;

      if (callControlId && streamId) {
        telnyxMediaHandler.stopMediaStream(streamId, callControlId);
      }

      // Update call metadata to remove streaming info
      await storage.updateCall(id, { 
        metadata: updateMetadata(call.metadata, { 
          mediaStreaming: false,
          streamId: null,
          streamingConfig: null 
        })
      });

      res.json({ success: true, message: "Media streaming stopped" });
    } catch (error) {
      console.error('Failed to stop media stream:', error);
      res.status(500).json({ message: "Failed to stop media stream" });
    }
  });

  app.get("/api/calls/:id/media-config", async (req, res) => {
    try {
      const { id } = req.params;
      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const streamingConfig = (call.metadata as any)?.streamingConfig;
      const isStreaming = (call.metadata as any)?.mediaStreaming || false;
      const streamId = (call.metadata as any)?.streamId;

      res.json({ 
        success: true,
        isStreaming,
        streamId,
        config: streamingConfig || null,
        callId: call.callId
      });
    } catch (error) {
      console.error('Failed to get media config:', error);
      res.status(500).json({ message: "Failed to get media config" });
    }
  });

  // Media streaming statistics endpoint
  app.get("/api/media-stats", async (req, res) => {
    try {
      res.json({
        activeStreams: telnyxMediaHandler.getActiveStreamsCount(),
        streamingUrl: telnyxMediaHandler.getStreamingUrl(),
        serverStatus: 'running'
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to get media statistics" });
    }
  });

  return httpServer;
}