import axios, { AxiosInstance } from "axios";
import { TELNYX_CONFIG } from "../telnyx-config.js";

export interface TelnyxCall {
  call_control_id: string;
  call_leg_id: string;
  call_session_id: string;
  to: string;
  from: string;
  direction: 'outbound' | 'inbound';
  state: 'parked' | 'ringing' | 'answered' | 'bridged' | 'hangup';
}

export interface TelnyxConference {
  id: string;
  name: string;
  status: 'init' | 'in_progress' | 'completed';
  participants: TelnyxCall[];
}

export class TelnyxClient {
  private api: AxiosInstance;
  private webhookUrl: string;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.telnyx.com/v2',
      headers: {
        'Authorization': `Bearer ${TELNYX_CONFIG.API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    // In production, this would be your actual webhook URL
    this.webhookUrl = 'https://54cdb265ccf9.ngrok-free.app/webhooks/calls';
  }

  // Call Management
  async createCall(to: string, from?: string): Promise<TelnyxCall> {
    try {
      const response = await this.api.post('/calls', {
        to,
        from: from || TELNYX_CONFIG.FROM_NUMBER,
        connection_id: TELNYX_CONFIG.APPLICATION_ID,
        webhook_url: this.webhookUrl,
        webhook_url_method: 'POST'
      });
      return response.data.data;
    } catch (error: any) {
      if (error.response && error.response.data && error.response.data.errors) {
        error.response.data.errors.forEach((err: any) => {
          console.error(`❌ Error in field ${err.source.pointer}: ${err.detail}`);
        });
      } else {
        console.error('❌ Unknown error:', error.message);
      }
    }
  }

  async answerCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/answer`);
  }

  async hangupCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/hangup`);
  }

  async holdCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/hold`);
  }

  async unholdCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/unhold`);
  }

  async muteCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/mute`);
  }

  async unmuteCall(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/unmute`);
  }

  // Transfer Operations
  async blindTransfer(callControlId: string, to: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/transfer`, {
      to,
      from: TELNYX_CONFIG.FROM_NUMBER
    });
  }

  async attendedTransfer(callControlId: string, targetCallControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/transfer`, {
      target_call_control_id: targetCallControlId
    });
  }

  async bridgeCalls(callControlId1: string, callControlId2: string): Promise<void> {
    await this.api.post(`/calls/${callControlId1}/actions/bridge`, {
      call_control_id: callControlId2
    });
  }

  // Conference Operations
  async createConference(name: string, beepEnabled = true): Promise<TelnyxConference> {
    const response = await this.api.post('/conferences', {
      name,
      call_control_id: '', // Will be set when first participant joins
      start_conference_on_enter: true,
      end_conference_on_exit: true,
      play_beep_on_enter: beepEnabled,
      play_beep_on_exit: beepEnabled
    });

    return response.data.data;
  }

  async joinConference(callControlId: string, conferenceName: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/join_conference`, {
      conference_name: conferenceName,
      start_conference_on_enter: true,
      end_conference_on_exit: false
    });
  }

  async leaveConference(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/leave_conference`);
  }

  async muteConferenceParticipant(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/conference_mute`);
  }

  async unmuteConferenceParticipant(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/conference_unmute`);
  }

  async holdConferenceParticipant(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/conference_hold`);
  }

  async unholdConferenceParticipant(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/conference_unhold`);
  }

  // Recording Operations
  async startRecording(callControlId: string): Promise<{ recording_id: string }> {
    const response = await this.api.post(`/calls/${callControlId}/actions/record_start`, {
      format: 'mp3',
      channels: 'dual'
    });

    return response.data.data;
  }

  async stopRecording(callControlId: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/record_stop`);
  }

  // DTMF Operations
  async sendDTMF(callControlId: string, digits: string): Promise<void> {
    await this.api.post(`/calls/${callControlId}/actions/send_dtmf`, {
      digits
    });
  }

  // Call Information
  async getCall(callControlId: string): Promise<TelnyxCall> {
    const response = await this.api.get(`/calls/${callControlId}`);
    return response.data.data;
  }

  async listActiveCalls(): Promise<TelnyxCall[]> {
    const response = await this.api.get('/calls', {
      params: {
        'filter[status]': 'answered'
      }
    });
    return response.data.data;
  }

  // Conference Information  
  async getConference(conferenceId: string): Promise<TelnyxConference> {
    const response = await this.api.get(`/conferences/${conferenceId}`);
    return response.data.data;
  }

  async listConferences(): Promise<TelnyxConference[]> {
    const response = await this.api.get('/conferences');
    return response.data.data;
  }

  // Connection Test
  async testConnection(): Promise<boolean> {
    try {
      // Test with Call Control applications endpoint - more reliable for our use case
      const response = await this.api.get('/call_control_applications');
      console.log('Telnyx connection test successful:', response.status);
      return true;
    } catch (error: any) {
      console.error('Telnyx connection test failed:', error?.response?.status, error?.response?.data);
      
      // Check specific error types
      if (error?.response?.status === 401) {
        console.error('Authentication failed - check API key format and permissions');
      } else if (error?.response?.status === 403) {
        console.error('Forbidden - API key may not have required permissions');
      } else if (error?.response?.status === 404) {
        console.error('Endpoint not found - check account setup');
      }
      
      return false;
    }
  }

  // Webhook validation
  validateWebhook(signature: string, body: string, timestamp: string): boolean {
    // Implement webhook signature validation for security
    // This is important for production deployments
    return true; // Simplified for development
  }
}

export const telnyxClient = new TelnyxClient();