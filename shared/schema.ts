import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const calls = pgTable("calls", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  callId: text("call_id").notNull().unique(),
  fromNumber: text("from_number").notNull(),
  toNumber: text("to_number").notNull(),
  status: text("status").notNull(), // 'ringing', 'active', 'held', 'ended', 'conference'
  startTime: timestamp("start_time").defaultNow(),
  endTime: timestamp("end_time"),
  duration: text("duration"),
  metadata: jsonb("metadata"),
});

export const telnyxConfig = pgTable("telnyx_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  apiKey: text("api_key").notNull(),
  applicationId: text("application_id").notNull(),
  sipConnectionId: text("sip_connection_id").notNull(),
  username: text("username").notNull(),
  password: text("password").notNull(),
  fromNumber: text("from_number").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertCallSchema = createInsertSchema(calls).omit({
  id: true,
  startTime: true,
  endTime: true,
});

export const insertTelnyxConfigSchema = createInsertSchema(telnyxConfig).omit({
  id: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertCall = z.infer<typeof insertCallSchema>;
export type Call = typeof calls.$inferSelect;
export type InsertTelnyxConfig = z.infer<typeof insertTelnyxConfigSchema>;
export type TelnyxConfig = typeof telnyxConfig.$inferSelect;
