import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertCallSchema, insertTelnyxConfigSchema } from "@shared/schema";
import { telnyxClient } from "./telnyx-client.js";

export function registerRoutes(app: Express): Server {
  const httpServer = createServer(app);

  // Helper functions
  const getCallControlId = (metadata: any): string | undefined => metadata?.telnyxCallControlId;
  const updateMetadata = (existing: any, updates: any): any => ({ ...existing, ...updates });

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
      const { toNumber, fromNumber } = req.body;
      
      // Create call through Telnyx
      const telnyxCall = await telnyxClient.createCall(toNumber, fromNumber);
      
      // Store call record in database
      const call = await storage.createCall({
        callId: telnyxCall.call_control_id,
        fromNumber: telnyxCall.from,
        toNumber: telnyxCall.to,
        status: 'ringing',
        metadata: {
          telnyxCallControlId: telnyxCall.call_control_id,
          telnyxCallSessionId: telnyxCall.call_session_id,
          direction: telnyxCall.direction
        }
      });
      
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

  // WebSocket server for real-time call updates
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws) => {
    console.log('Client connected to WebSocket');

    ws.on('message', async (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        switch (data.type) {
          case 'call_status_update':
            const callUpdate = {
              type: 'call_status_update',
              data: data.payload
            };
            
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(callUpdate));
              }
            });
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  return httpServer;
}