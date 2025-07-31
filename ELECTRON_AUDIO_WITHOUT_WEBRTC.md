# Electron Audio Management Without WebRTC

## Audio Handling Options for Electron Softphone

### 1. Telnyx Call Control API + Media Streaming

**Best Option for Production Apps**

Instead of WebRTC, use Telnyx's Call Control API which handles the media streaming server-side, and you just control the calls programmatically.

```typescript
// Main Process (main.ts)
import { app, BrowserWindow, ipcMain } from 'electron';
import axios from 'axios';

class TelnyxCallManager {
  private apiKey: string;
  private baseUrl = 'https://api.telnyx.com/v2';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createCall(to: string, from: string) {
    const response = await axios.post(`${this.baseUrl}/calls`, {
      to,
      from,
      connection_id: 'your-connection-id',
      webhook_url: 'https://your-app.com/webhooks/calls'
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    return response.data.data;
  }

  async answerCall(callControlId: string) {
    await axios.post(`${this.baseUrl}/calls/${callControlId}/actions/answer`, {}, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }

  async hangupCall(callControlId: string) {
    await axios.post(`${this.baseUrl}/calls/${callControlId}/actions/hangup`, {}, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }

  async transferCall(callControlId: string, to: string) {
    await axios.post(`${this.baseUrl}/calls/${callControlId}/actions/transfer`, {
      to
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }

  async createConference(name: string) {
    const response = await axios.post(`${this.baseUrl}/conferences`, {
      name,
      play_beep_on_enter: true,
      play_beep_on_exit: true
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
    
    return response.data.data;
  }

  async joinConference(callControlId: string, conferenceName: string) {
    await axios.post(`${this.baseUrl}/calls/${callControlId}/actions/join_conference`, {
      conference_name: conferenceName
    }, {
      headers: { 'Authorization': `Bearer ${this.apiKey}` }
    });
  }
}

// Setup IPC handlers
const callManager = new TelnyxCallManager(process.env.TELNYX_API_KEY);

ipcMain.handle('make-call', async (event, to: string, from: string) => {
  return await callManager.createCall(to, from);
});

ipcMain.handle('answer-call', async (event, callControlId: string) => {
  return await callManager.answerCall(callControlId);
});

ipcMain.handle('hangup-call', async (event, callControlId: string) => {
  return await callManager.hangupCall(callControlId);
});

ipcMain.handle('transfer-call', async (event, callControlId: string, to: string) => {
  return await callManager.transferCall(callControlId, to);
});

ipcMain.handle('create-conference', async (event, name: string) => {
  return await callManager.createConference(name);
});

ipcMain.handle('join-conference', async (event, callControlId: string, conferenceName: string) => {
  return await callManager.joinConference(callControlId, conferenceName);
});
```

### 2. SIP Client Integration (Advanced Option)

**For Direct SIP Protocol Handling**

Use a native SIP library like `node-sip` or integrate with PJSIP via native modules.

```typescript
// Install: npm install sip2 node-gyp
import * as sip from 'sip2';

class SIPClient {
  private client: any;

  constructor(username: string, password: string, domain: string) {
    this.client = sip.create({
      username,
      password,
      domain,
      transport: 'udp'
    });
  }

  async makeCall(number: string) {
    return new Promise((resolve, reject) => {
      const session = this.client.invite(`sip:${number}@${domain}`, {
        media: {
          audio: true,
          video: false
        }
      });

      session.on('accepted', () => {
        console.log('Call connected');
        resolve(session);
      });

      session.on('rejected', (response: any) => {
        reject(new Error(`Call rejected: ${response.reason}`));
      });
    });
  }

  async receiveCall(session: any) {
    // Handle incoming call
    session.accept();
  }

  async transferCall(session: any, target: string) {
    session.refer(`sip:${target}@${domain}`);
  }
}
```

### 3. Native Audio Device Access (Electron-Specific)

**For Direct Hardware Control**

```typescript
// Main Process - Audio Device Management
import { desktopCapturer, systemPreferences } from 'electron';

class AudioDeviceManager {
  async getAudioDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'audioinput' || device.kind === 'audiooutput');
  }

  async requestMicrophoneAccess() {
    const access = await systemPreferences.askForMediaAccess('microphone');
    return access;
  }

  async captureSystemAudio() {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      fetchWindowIcons: false
    });
    
    return sources;
  }

  async setDefaultAudioDevice(deviceId: string) {
    // Platform-specific implementation
    if (process.platform === 'darwin') {
      // macOS implementation
      const { exec } = require('child_process');
      exec(`SwitchAudioSource -s "${deviceId}"`);
    } else if (process.platform === 'win32') {
      // Windows implementation using node-audio-windows
    }
  }
}

// IPC Handlers for Audio Management
ipcMain.handle('get-audio-devices', async () => {
  const audioManager = new AudioDeviceManager();
  return await audioManager.getAudioDevices();
});

ipcMain.handle('request-microphone', async () => {
  const audioManager = new AudioDeviceManager();
  return await audioManager.requestMicrophoneAccess();
});
```

### 4. React Renderer Components (Frontend)

```typescript
// renderer/components/CallManager.tsx
import { ipcRenderer } from 'electron';
import { useState, useEffect } from 'react';

interface Call {
  id: string;
  callControlId: string;
  to: string;
  from: string;
  status: 'ringing' | 'active' | 'held' | 'ended';
}

export function CallManager() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const makeCall = async (number: string) => {
    try {
      const call = await ipcRenderer.invoke('make-call', number, '+1234567890');
      setCalls(prev => [...prev, {
        id: call.call_control_id,
        callControlId: call.call_control_id,
        to: number,
        from: '+1234567890',
        status: 'ringing'
      }]);
    } catch (error) {
      console.error('Failed to make call:', error);
    }
  };

  const hangupCall = async (callControlId: string) => {
    try {
      await ipcRenderer.invoke('hangup-call', callControlId);
      setCalls(prev => prev.filter(call => call.callControlId !== callControlId));
    } catch (error) {
      console.error('Failed to hangup call:', error);
    }
  };

  const transferCall = async (callControlId: string, target: string) => {
    try {
      await ipcRenderer.invoke('transfer-call', callControlId, target);
      // Call will be ended after successful transfer
      setCalls(prev => prev.filter(call => call.callControlId !== callControlId));
    } catch (error) {
      console.error('Failed to transfer call:', error);
    }
  };

  const createConference = async () => {
    try {
      const conference = await ipcRenderer.invoke('create-conference', `conf_${Date.now()}`);
      
      // Join all active calls to conference
      const activeCalls = calls.filter(call => call.status === 'active');
      for (const call of activeCalls) {
        await ipcRenderer.invoke('join-conference', call.callControlId, conference.name);
      }
    } catch (error) {
      console.error('Failed to create conference:', error);
    }
  };

  return (
    <div className="call-manager">
      <div className="dialer">
        <input 
          type="tel" 
          placeholder="Enter phone number"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              makeCall(e.currentTarget.value);
              e.currentTarget.value = '';
            }
          }}
        />
      </div>

      <div className="active-calls">
        {calls.map(call => (
          <div key={call.id} className="call-item">
            <span>{call.to}</span>
            <span>{call.status}</span>
            <button onClick={() => hangupCall(call.callControlId)}>
              Hangup
            </button>
            <button onClick={() => {
              const target = prompt('Transfer to:');
              if (target) transferCall(call.callControlId, target);
            }}>
              Transfer
            </button>
          </div>
        ))}
      </div>

      {calls.length > 1 && (
        <button onClick={createConference}>
          Create Conference
        </button>
      )}
    </div>
  );
}
```

### 5. Webhook Handler for Real-time Updates

```typescript
// webhook-server.ts (separate service or integrated)
import express from 'express';

const app = express();
app.use(express.json());

app.post('/webhooks/calls', (req, res) => {
  const event = req.body;
  
  // Send updates to Electron app via IPC or WebSocket
  switch (event.data.event_type) {
    case 'call.initiated':
      // Notify app of incoming call
      mainWindow.webContents.send('incoming-call', event.data.payload);
      break;
      
    case 'call.answered':
      // Update call status to active
      mainWindow.webContents.send('call-answered', event.data.payload);
      break;
      
    case 'call.hangup':
      // Remove call from active list
      mainWindow.webContents.send('call-ended', event.data.payload);
      break;
      
    case 'conference.participant.joined':
      // Update conference participant list
      mainWindow.webContents.send('conference-updated', event.data.payload);
      break;
  }
  
  res.status(200).send('OK');
});

app.listen(3000, () => {
  console.log('Webhook server running on port 3000');
});
```

## Key Benefits of This Approach

### 1. **No WebRTC Complexity**
- Server-side media handling
- No peer-to-peer connection management
- No browser audio limitations

### 2. **Professional Features**
- **True Conference Calls**: Server-side mixing, unlimited participants
- **Proper Call Transfer**: Blind, attended, and consultation transfers
- **Advanced Controls**: Hold, mute, recording, monitoring

### 3. **Better Reliability**
- Server-grade infrastructure
- Automatic failover and redundancy
- Better network handling

### 4. **Enterprise Features**
- Call recording and analytics
- Queue management
- IVR integration
- CRM webhooks

## Implementation Steps

1. **Setup Telnyx Account**: Get API keys and configure SIP connection
2. **Create Electron App**: Basic window and main process setup
3. **Implement Call Control**: Use Telnyx API for all call operations
4. **Add Audio Device Management**: Native device access and control
5. **Setup Webhooks**: Real-time event handling for call state updates
6. **Build UI Components**: React components for call management
7. **Add Advanced Features**: Conference, transfer, recording capabilities

This approach gives you a professional-grade softphone without any WebRTC limitations, with full access to enterprise calling features through Telnyx's infrastructure.