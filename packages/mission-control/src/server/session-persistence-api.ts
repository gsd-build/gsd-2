/**
 * session-persistence-api.ts
 *
 * Read/write API for .planning/.mission-control-session.json.
 * This file persists layout preferences, chat history (capped at 50 per session),
 * and the active viewport selection across restarts.
 *
 * Distinct from .session-metadata.json — that file tracks session IDs and
 * Claude session continuity. This file is the Mission Control UI state.
 *
 * Patterns: readFile (async) on startup, writeFileSync (sync) on state changes
 * — same approach as session-manager.ts persistMetadataSync.
 */

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";

const SESSION_FILE = ".mission-control-session.json";
const CHAT_HISTORY_CAP = 50;

export interface ChatHistoryMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
}

export interface MissionControlSession {
  version: 1;
  layoutPrefs: Record<string, number>;   // panel group id -> size in pixels
  chatHistory: Record<string, ChatHistoryMessage[]>;  // sessionId -> last 50 messages
  lastView: "chat";                      // always "chat" — locked decision per CONTEXT.md
  activeViewport: "desktop" | "tablet" | "mobile" | "dual";
}

const DEFAULT_SESSION: MissionControlSession = {
  version: 1,
  layoutPrefs: {},
  chatHistory: {},
  lastView: "chat",
  activeViewport: "desktop",
};

/**
 * Read the Mission Control session file from planningDir.
 * Returns default values if the file does not exist or is malformed.
 *
 * @param planningDir - Path to the .planning directory
 */
export async function readSession(planningDir: string): Promise<MissionControlSession> {
  const filePath = join(planningDir, SESSION_FILE);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<MissionControlSession>;
    // Merge with defaults to handle missing fields gracefully
    return {
      ...DEFAULT_SESSION,
      ...parsed,
      // Ensure nested objects are present
      layoutPrefs: parsed.layoutPrefs ?? {},
      chatHistory: parsed.chatHistory ?? {},
    };
  } catch {
    // File missing or malformed — return defaults
    return { ...DEFAULT_SESSION };
  }
}

/**
 * Write the Mission Control session file synchronously.
 * Enforces the 50-message cap per sessionId in chatHistory.
 *
 * @param planningDir - Path to the .planning directory
 * @param data - The session data to persist
 */
export function writeSession(planningDir: string, data: MissionControlSession): void {
  const filePath = join(planningDir, SESSION_FILE);

  // Enforce 50-message cap per sessionId (Pitfall 5)
  const cappedHistory: Record<string, ChatHistoryMessage[]> = {};
  for (const [sessionId, messages] of Object.entries(data.chatHistory)) {
    cappedHistory[sessionId] = messages.slice(-CHAT_HISTORY_CAP);
  }

  const toWrite: MissionControlSession = {
    ...data,
    chatHistory: cappedHistory,
  };

  writeFileSync(filePath, JSON.stringify(toWrite, null, 2), "utf-8");
}
