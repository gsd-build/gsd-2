/**
 * WebSocket server for broadcasting PlanningState updates.
 * Uses Bun.serve() with WebSocket support and topic-based pub/sub.
 *
 * Clients receive full state on connect, diff-only updates on changes.
 * Supports "refresh" message to re-send full state.
 */
import type { PlanningState, StateDiff } from "./types";
import type { PermissionResponse } from "./chat-types";
import type { Server, ServerWebSocket } from "bun";

/** Session action types for multi-session CRUD over WebSocket. */
export type SessionAction =
  | { type: "session_create"; forkFromSessionId?: string }
  | { type: "session_close"; sessionId: string; closeAction?: "merge" | "keep" | "delete" }
  | { type: "session_rename"; sessionId: string; name: string }
  | { type: "session_list" }
  | { type: "session_interrupt"; sessionId: string }
  | { type: "session_force_complete"; sessionId: string };

export interface WsServerOptions {
  port: number;
  getFullState: () => PlanningState;
  /** Called when a client sends a chat message. sessionId is optional for backward compat. */
  onChatMessage?: (prompt: string, ws: ServerWebSocket, sessionId?: string) => void;
  /** Custom slash commands discovered at startup. Sent to clients on connect. */
  customCommands?: Array<{ command: string; description: string; args: string; source: string }>;
  /** Called when a client sends a permission response (approve/deny/always_allow). */
  onPermissionResponse?: (response: PermissionResponse, ws: ServerWebSocket) => void;
  /** Called when a client sends a session action (create/close/rename/list). */
  onSessionAction?: (action: SessionAction, ws: ServerWebSocket) => void;
  /** Called when a new client connects, after initial state is sent. */
  onClientConnect?: (ws: ServerWebSocket) => void;
}

export interface WsServer {
  broadcast(diff: StateDiff): void;
  /** Send a chat response to a specific client. */
  sendToClient(ws: ServerWebSocket, data: unknown): void;
  /** Broadcast chat event to all clients subscribed to "chat" topic. */
  publishChat(data: unknown): void;
  /** Broadcast session metadata updates to all clients. */
  publishSessionUpdate(data: unknown): void;
  stop(): void;
  getSequence(): number;
  /** The hostname the server is bound to. */
  readonly hostname: string;
}

const TOPIC = "planning-state";
const CHAT_TOPIC = "chat";

/**
 * Creates a WebSocket server on the specified port.
 *
 * - On client connect: sends full state with type "full"
 * - On "refresh" message: sends full state again
 * - On JSON { type: "chat" } message: calls onChatMessage callback
 * - broadcast(): publishes diff to all subscribed clients via topic
 * - publishChat(): publishes chat events to all subscribed clients via "chat" topic
 * - Monotonic sequence counter increments on every message sent
 */
export function createWsServer(options: WsServerOptions): WsServer {
  const { port, getFullState, onChatMessage, customCommands, onPermissionResponse, onSessionAction, onClientConnect } = options;
  let sequence = 0;

  const server = Bun.serve({
    port,
    hostname: "127.0.0.1",
    // SECURITY NOTE — Intentional: No authentication on WebSocket connections.
    //
    // This is an accepted design decision for a desktop application:
    // 1. The server binds to 127.0.0.1 only (line above) — not accessible from the network
    // 2. The local-process threat (any process on the machine can connect) is an accepted
    //    risk for a single-user desktop app where the user controls all local processes
    // 3. The X-Window-Id header is used for routing (session multiplexing) but is NOT
    //    a security credential — it does not authenticate the connection
    //
    // If Mission Control ever becomes a multi-user or network-accessible service,
    // WebSocket authentication (e.g., token in upgrade request) would be required.
    fetch(req, server) {
      const upgraded = server.upgrade(req);
      if (upgraded) return undefined;
      return new Response("Mission Control WebSocket Server", { status: 200 });
    },
    websocket: {
      open(ws: ServerWebSocket) {
        ws.subscribe(TOPIC);
        ws.subscribe(CHAT_TOPIC);
        sequence++;
        const state = getFullState();
        ws.send(
          JSON.stringify({
            type: "full",
            state,
            sequence,
            timestamp: Date.now(),
          })
        );
        // Send custom commands if available (for slash command autocomplete)
        if (customCommands && customCommands.length > 0) {
          ws.send(JSON.stringify({ type: "custom_commands", commands: customCommands }));
        }
        // Send current session list so client knows activeSessionId immediately
        if (onClientConnect) {
          onClientConnect(ws);
        }
      },
      message(ws: ServerWebSocket, message: string | Buffer) {
        const msg = typeof message === "string" ? message : message.toString();
        if (msg === "refresh") {
          sequence++;
          const state = getFullState();
          ws.send(
            JSON.stringify({
              type: "full",
              state,
              sequence,
              timestamp: Date.now(),
            })
          );
          return;
        }

        // Try parsing JSON messages (chat protocol + session actions)
        try {
          const parsed = JSON.parse(msg);
          if (parsed.type === "chat" && parsed.prompt && onChatMessage) {
            console.log(`[ws-server] Chat message received: "${parsed.prompt.slice(0, 80)}"`);
            onChatMessage(parsed.prompt, ws, parsed.sessionId);
          } else if (parsed.type === "permission_response" && onPermissionResponse) {
            console.log(`[ws-server] Permission response: ${parsed.action} for ${parsed.promptId}`);
            onPermissionResponse(parsed as PermissionResponse, ws);
          } else if (
            onSessionAction &&
            (parsed.type === "session_create" ||
              parsed.type === "session_close" ||
              parsed.type === "session_rename" ||
              parsed.type === "session_list" ||
              parsed.type === "session_interrupt" ||
              parsed.type === "session_force_complete")
          ) {
            console.log(`[ws-server] Session action: ${parsed.type}`);
            onSessionAction(parsed as SessionAction, ws);
          }
        } catch {
          // Not JSON -- ignore (could be other string messages)
        }
      },
      close(ws: ServerWebSocket) {
        ws.unsubscribe(TOPIC);
        ws.unsubscribe(CHAT_TOPIC);
      },
    },
  });

  return {
    broadcast(diff: StateDiff): void {
      sequence++;
      diff.sequence = sequence;
      server.publish(TOPIC, JSON.stringify(diff));
    },
    sendToClient(ws: ServerWebSocket, data: unknown): void {
      const payload = JSON.stringify(data);
      const result = ws.send(payload);
      if (result === -1) {
        console.warn(`[ws-server] sendToClient: message dropped (backpressure), type=${(data as { type?: string })?.type}`);
      }
    },
    publishChat(data: unknown): void {
      server.publish(CHAT_TOPIC, JSON.stringify(data));
    },
    publishSessionUpdate(data: unknown): void {
      server.publish(CHAT_TOPIC, JSON.stringify(data));
    },
    stop(): void {
      server.stop(true);
    },
    getSequence(): number {
      return sequence;
    },
    get hostname(): string {
      return server.hostname ?? "localhost";
    },
  };
}
