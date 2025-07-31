import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { insertCallSchema, insertTelnyxConfigSchema } from "@shared/schema";
import { telnyxClient } from "./telnyx-client.js";

// Helper function to get Telnyx call control ID from metadata
function getCallControlId(metadata: any): string | undefined {
  return metadata?.telnyxCallControlId;
}

// Helper function to update metadata safely
function updateMetadata(existing: any, updates: any): any {
  return { ...existing, ...updates };
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);

  // API Routes
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
      
      const callControlId = call.metadata?.telnyxCallControlId;
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
        delete updates.action; // Remove action from database updates
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
      
      // Hangup call in Telnyx if still active
      const callControlId = call.metadata?.telnyxCallControlId;
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
      if (!config) {
        return res.status(404).json({ message: "Telnyx config not found" });
      }
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
      
      if (isConnected) {
        res.json({ success: true, message: "Telnyx connection successful" });
      } else {
        res.status(400).json({ success: false, message: "Failed to connect to Telnyx" });
      }
    } catch (error) {
      res.status(500).json({ success: false, message: "Failed to test connection" });
    }
  });

  // Transfer endpoints
  app.post("/api/calls/:id/transfer", async (req, res) => {
    try {
      const { id } = req.params;
      const { to, type = 'blind' } = req.body;

      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      if (type === 'blind') {
        await telnyxClient.blindTransfer(callControlId, to);
        await storage.updateCall(id, { 
          status: 'ended',
          endTime: new Date(),
          metadata: { ...call.metadata, transferredTo: to }
        });
      } else if (type === 'attended') {
        // For attended transfer, we need a target call ID
        const { targetCallId } = req.body;
        if (!targetCallId) {
          return res.status(400).json({ message: "Target call ID required for attended transfer" });
        }
        
        const targetCall = await storage.getCall(targetCallId);
        if (!targetCall) {
          return res.status(404).json({ message: "Target call not found" });
        }

        const targetCallControlId = targetCall.metadata?.telnyxCallControlId;
        if (!targetCallControlId) {
          return res.status(400).json({ message: "Invalid target call" });
        }

        await telnyxClient.attendedTransfer(callControlId, targetCallControlId);
        await storage.updateCall(id, { status: 'ended', endTime: new Date() });
        await storage.updateCall(targetCallId, { status: 'ended', endTime: new Date() });
      }

      res.json({ success: true, message: "Transfer initiated" });
    } catch (error) {
      console.error('Transfer failed:', error);
      res.status(500).json({ message: "Transfer failed" });
    }
  });

  // Conference endpoints
  app.post("/api/conferences", async (req, res) => {
    try {
      const { name, beepEnabled = true } = req.body;
      const conferenceName = name || `conf_${Date.now()}`;
      
      const conference = await telnyxClient.createConference(conferenceName, beepEnabled);
      
      res.json({
        id: conference.id,
        name: conferenceName,
        status: 'created',
        participants: []
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

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      await telnyxClient.joinConference(callControlId, conferenceName);
      await storage.updateCall(id, { 
        status: 'conference',
        metadata: { ...call.metadata, conferenceName }
      });

      res.json({ success: true, message: "Joined conference" });
    } catch (error) {
      console.error('Failed to join conference:', error);
      res.status(500).json({ message: "Failed to join conference" });
    }
  });

  app.post("/api/calls/:id/leave-conference", async (req, res) => {
    try {
      const { id } = req.params;

      const call = await storage.getCall(id);
      if (!call) {
        return res.status(404).json({ message: "Call not found" });
      }

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      await telnyxClient.leaveConference(callControlId);
      await storage.updateCall(id, { 
        status: 'active',
        metadata: { ...call.metadata, conferenceName: undefined }
      });

      res.json({ success: true, message: "Left conference" });
    } catch (error) {
      console.error('Failed to leave conference:', error);
      res.status(500).json({ message: "Failed to leave conference" });
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

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      const recording = await telnyxClient.startRecording(callControlId);
      await storage.updateCall(id, { 
        metadata: { ...call.metadata, recordingId: recording.recording_id, isRecording: true }
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

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
      }

      await telnyxClient.stopRecording(callControlId);
      await storage.updateCall(id, { 
        metadata: { ...call.metadata, isRecording: false }
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

      const callControlId = call.metadata?.telnyxCallControlId;
      if (!callControlId) {
        return res.status(400).json({ message: "Invalid call - missing Telnyx control ID" });
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
            // Broadcast call status updates to all connected clients
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

          case 'connection_status':
            // Handle connection status updates
            const statusUpdate = {
              type: 'connection_status',
              data: data.payload
            };
            
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(statusUpdate));
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
