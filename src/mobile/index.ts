/**
 * GSD Mobile Socket System
 *
 * Self-hosted WebSocket server for accessing GSD sessions from a mobile device.
 *
 * Architecture:
 *   Mobile App ←→ WebSocket ←→ MobileSocketServer ←→ BridgeService ←→ Agent Session
 *
 * Key modules:
 *   - protocol.ts   — Message type definitions for the WebSocket protocol
 *   - auth.ts       — Token-based device pairing and authentication
 *   - connection.ts — Per-client WebSocket connection handler
 *   - server.ts     — Self-hosted WebSocket server with TLS support
 *   - cli.ts        — CLI interface for managing the mobile server
 */

export { MobileSocketServer, type MobileSocketServerOptions, type MobileSocketServerInfo } from "./server.ts";
export { MobileAuthManager, type PairedDevice } from "./auth.ts";
export { MobileConnection, type MobileConnectionConfig } from "./connection.ts";
export { runMobileCLI, type MobileCLIOptions } from "./cli.ts";
export { SimpleWebSocket, upgradeToWebSocket } from "./websocket.ts";

// Re-export protocol types for mobile app development
export type {
  // Client → Server
  MobileClientMessage,
  MobileAuthMessage,
  MobileListSessionsMessage,
  MobileAttachSessionMessage,
  MobileDetachSessionMessage,
  MobilePromptMessage,
  MobileSteerMessage,
  MobileAbortMessage,
  MobileGetStateMessage,
  MobileGetMessagesMessage,
  MobileNewSessionMessage,
  MobileSwitchSessionMessage,
  MobileExtensionUIResponseMessage,
  MobilePingMessage,

  // Server → Client
  MobileServerMessage,
  MobileAuthResultMessage,
  MobileResponseMessage,
  MobileSessionEventMessage,
  MobileBridgeStatusMessage,
  MobileExtensionUIRequestMessage,
  MobilePongMessage,
  MobileServerShutdownMessage,
} from "./protocol.ts";
