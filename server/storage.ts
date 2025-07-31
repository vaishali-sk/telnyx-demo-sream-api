import { type User, type InsertUser, type Call, type InsertCall, type TelnyxConfig, type InsertTelnyxConfig } from "@shared/schema";
import { randomUUID } from "crypto";
import {TELNYX_CONFIG} from "../telnyx-config.js";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getCalls(): Promise<Call[]>;
  getCall(id: string): Promise<Call | undefined>;
  getCallByCallId(callId: string): Promise<Call | undefined>;
  createCall(call: InsertCall): Promise<Call>;
  updateCall(id: string, updates: Partial<Call>): Promise<Call | undefined>;
  deleteCall(id: string): Promise<boolean>;
  
  getTelnyxConfig(): Promise<TelnyxConfig | undefined>;
  createOrUpdateTelnyxConfig(config: InsertTelnyxConfig): Promise<TelnyxConfig>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private calls: Map<string, Call>;
  private telnyxConfig: TelnyxConfig | undefined;

  constructor() {
    this.users = new Map();
    this.calls = new Map();
    
    // Initialize with pre-configured Telnyx credentials
    this.telnyxConfig = {
      id: randomUUID(),
      apiKey: TELNYX_CONFIG.API_KEY,
      applicationId: TELNYX_CONFIG.APPLICATION_ID,
      sipConnectionId: TELNYX_CONFIG.SIP_CONNECTION_ID,
      username: TELNYX_CONFIG.USERNAME,
      password: TELNYX_CONFIG.PASSWORD,
      fromNumber: TELNYX_CONFIG.FROM_NUMBER
    };
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async getCalls(): Promise<Call[]> {
    return Array.from(this.calls.values());
  }

  async getCall(id: string): Promise<Call | undefined> {
    return this.calls.get(id);
  }

  async getCallByCallId(callId: string): Promise<Call | undefined> {
    return Array.from(this.calls.values()).find(call => call.callId === callId);
  }

  async createCall(insertCall: InsertCall): Promise<Call> {
    const id = randomUUID();
    const call: Call = {
      ...insertCall,
      id,
      startTime: new Date(),
      endTime: null,
      duration: null,
      metadata: insertCall.metadata || {}
    };
    this.calls.set(id, call);
    return call;
  }

  async updateCall(id: string, updates: Partial<Call>): Promise<Call | undefined> {
    const call = this.calls.get(id);
    if (!call) return undefined;
    
    const updatedCall = { ...call, ...updates };
    this.calls.set(id, updatedCall);
    return updatedCall;
  }

  async deleteCall(id: string): Promise<boolean> {
    return this.calls.delete(id);
  }

  async getTelnyxConfig(): Promise<TelnyxConfig | undefined> {
    return this.telnyxConfig;
  }

  async createOrUpdateTelnyxConfig(config: InsertTelnyxConfig): Promise<TelnyxConfig> {
    const id = this.telnyxConfig?.id || randomUUID();
    this.telnyxConfig = { ...config, id };
    return this.telnyxConfig;
  }
}

export const storage = new MemStorage();
