import type { Express } from "express";
import { createServer, type Server } from "http";
import path from "path";
import { storage } from "./storage";
import { insertCallSchema, insertTelnyxConfigSchema } from "@shared/schema";
import { telnyxClient } from "./telnyx-client.ts";
import { TelnyxMediaHandler } from "./telnyx-media.ts";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);
  
  // Initialize Telnyx Media Handler for official WebSocket streaming
  console.log('Initializing Telnyx Media Handler...');
  const telnyxMediaHandler = new TelnyxMediaHandler(httpServer);
  console.log('Telnyx Media Handler initialized successfully');

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
        // Start media streaming via Telnyx API
        const response = await telnyxClient.startMediaStreaming(callControlId, track, codec);
        
        // Update call metadata
        await storage.updateCall(id, {
          metadata: updateMetadata(call.metadata, {
            mediaStreaming: true,
            streamingConfig: { track, codec },
            streamingStarted: new Date().toISOString()
          })
        });

        res.json({
          success: true,
          message: 'Media streaming started',
          streamingUrl: `wss://${process.env.REPLIT_DOMAINS || 'localhost:5000'}/ws/telnyx-media`,
          streamId: response.stream_id || 'pending'
        });
        
        console.log(`🎵 Media streaming started for call ${callControlId}`);
        
      } catch (telnyxError) {
        console.error('Telnyx media streaming error:', telnyxError);
        res.status(500).json({ 
          success: false, 
          message: 'Failed to start media streaming via Telnyx' 
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