/**
 * Mobile Connection Manager
 *
 * Manages individual WebSocket connections from mobile clients.
 * Handles authentication, session attachment, and message routing.
 */

import type { SimpleWebSocket } from "./websocket.ts";
import { WS_OPEN } from "./websocket.ts";
import type { MobileAuthManager, PairedDevice } from "./auth.ts";
import type {
  MobileClientMessage,
  MobileServerMessage,
} from "./protocol.ts";
import type { BridgeService } from "../web/bridge-service.ts";
import type { BridgeEvent, BridgeRuntimeSnapshot } from "../web/bridge-service.ts";
import type { RpcExtensionUIRequest, RpcExtensionUIResponse } from "../../packages/pi-coding-agent/src/modes/rpc/rpc-types.ts";

export interface MobileConnectionConfig {
  bridge: BridgeService;
  auth: MobileAuthManager;
  projectCwd: string;
  serverVersion: string;
}

export class MobileConnection {
  readonly id: string;
  private ws: SimpleWebSocket;
  private config: MobileConnectionConfig;
  private device: PairedDevice | null = null;
  private authenticated = false;
  private unsubscribeBridge: (() => void) | null = null;
  private attached = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(id: string, ws: SimpleWebSocket, config: MobileConnectionConfig) {
    this.id = id;
    this.ws = ws;
    this.config = config;
    this.setupHandlers();
    this.startPingInterval();
  }

  private setupHandlers(): void {
    this.ws.on("message", (data: string | Buffer) => {
      try {
        const text = typeof data === "string" ? data : data.toString("utf-8");
        const message = JSON.parse(text) as MobileClientMessage;
        this.handleMessage(message);
      } catch {
        this.sendError("invalid_message", "Failed to parse message");
      }
    });

    this.ws.on("close", () => {
      this.cleanup();
    });

    this.ws.on("error", () => {
      this.cleanup();
    });
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WS_OPEN) {
        this.ws.ping();
      }
    }, 30_000);
  }

  private handleMessage(message: MobileClientMessage): void {
    if (message.type === "auth") {
      this.handleAuth(message);
      return;
    }

    if (message.type === "ping") {
      this.send({ type: "pong" });
      return;
    }

    if (!this.authenticated) {
      this.send({
        type: "auth_result",
        success: false,
        error: "Not authenticated. Send an auth message first.",
      });
      return;
    }

    switch (message.type) {
      case "list_sessions":
        this.handleListSessions(message);
        break;
      case "attach_session":
        this.handleAttachSession(message);
        break;
      case "detach_session":
        this.handleDetachSession(message);
        break;
      case "prompt":
        this.handlePrompt(message);
        break;
      case "steer":
        this.handleSteer(message);
        break;
      case "abort":
        this.handleAbort(message);
        break;
      case "get_state":
        this.handleGetState(message);
        break;
      case "get_messages":
        this.handleGetMessages(message);
        break;
      case "new_session":
        this.handleNewSession(message);
        break;
      case "switch_session":
        this.handleSwitchSession(message);
        break;
      case "extension_ui_response":
        this.handleExtensionUIResponse(message);
        break;
      default:
        this.sendError("unknown_message", `Unknown message type: ${(message as { type: string }).type}`);
    }
  }

  private handleAuth(message: MobileClientMessage & { type: "auth" }): void {
    // Try as a device token first
    const device = this.config.auth.validateToken(message.token);
    if (device) {
      this.device = device;
      this.authenticated = true;
      this.send({
        type: "auth_result",
        success: true,
        serverVersion: this.config.serverVersion,
        projectCwd: this.config.projectCwd,
      });
      return;
    }

    // Try as a pairing code
    const result = this.config.auth.redeemPairingCode(
      message.token,
      message.deviceName || "Mobile Device",
      message.platform || "unknown",
    );

    if (result) {
      this.device = this.config.auth.validateToken(result.token);
      this.authenticated = true;
      this.send({
        type: "auth_result",
        success: true,
        serverVersion: this.config.serverVersion,
        projectCwd: this.config.projectCwd,
      });
      // Send the persistent device token so the client can store it for reconnection
      this.send({
        type: "response",
        id: "pairing",
        success: true,
        data: { deviceToken: result.token, deviceId: result.deviceId },
      });
      return;
    }

    this.send({
      type: "auth_result",
      success: false,
      error: "Invalid token or pairing code",
    });
  }

  private async handleListSessions(message: MobileClientMessage & { type: "list_sessions" }): Promise<void> {
    try {
      const bridge = this.config.bridge;
      const snapshot = bridge.getSnapshot();
      this.send({
        type: "response",
        id: message.id,
        success: true,
        data: {
          activeSessionId: snapshot.activeSessionId,
          activeSessionFile: snapshot.activeSessionFile,
          projectCwd: snapshot.projectCwd,
          phase: snapshot.phase,
        },
      });
    } catch (error) {
      this.send({
        type: "response",
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async handleAttachSession(message: MobileClientMessage & { type: "attach_session" }): Promise<void> {
    try {
      // Detach previous subscription if any
      if (this.unsubscribeBridge) {
        this.unsubscribeBridge();
        this.unsubscribeBridge = null;
      }

      const bridge = this.config.bridge;
      const snapshot = bridge.getSnapshot();

      // Switch session if needed
      if (message.sessionPath && snapshot.activeSessionFile !== message.sessionPath) {
        await bridge.sendInput({
          type: "switch_session",
          sessionPath: message.sessionPath,
        });
      }

      // Subscribe to bridge events
      this.unsubscribeBridge = bridge.subscribe((event: BridgeEvent) => {
        this.forwardBridgeEvent(event);
      });
      this.attached = true;

      // Send current state
      const stateResponse = await bridge.sendInput({ type: "get_state" });
      this.send({
        type: "response",
        id: message.id,
        success: true,
        data: stateResponse,
      });

      // Send initial bridge status
      this.sendBridgeStatus(bridge.getSnapshot());
    } catch (error) {
      this.send({
        type: "response",
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private handleDetachSession(message: MobileClientMessage & { type: "detach_session" }): void {
    if (this.unsubscribeBridge) {
      this.unsubscribeBridge();
      this.unsubscribeBridge = null;
    }
    this.attached = false;
    this.send({ type: "response", id: message.id, success: true });
  }

  private async handlePrompt(message: MobileClientMessage & { type: "prompt" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "prompt", message: message.message });
  }

  private async handleSteer(message: MobileClientMessage & { type: "steer" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "steer", message: message.message });
  }

  private async handleAbort(message: MobileClientMessage & { type: "abort" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "abort" });
  }

  private async handleGetState(message: MobileClientMessage & { type: "get_state" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "get_state" });
  }

  private async handleGetMessages(message: MobileClientMessage & { type: "get_messages" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "get_messages" });
  }

  private async handleNewSession(message: MobileClientMessage & { type: "new_session" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "new_session" });
  }

  private async handleSwitchSession(message: MobileClientMessage & { type: "switch_session" }): Promise<void> {
    await this.forwardCommand(message.id, { type: "switch_session", sessionPath: message.sessionPath });
  }

  private async handleExtensionUIResponse(message: MobileClientMessage & { type: "extension_ui_response" }): Promise<void> {
    try {
      const uiResponse: RpcExtensionUIResponse = message.cancelled
        ? { type: "extension_ui_response", id: message.requestId, cancelled: true }
        : message.values
          ? { type: "extension_ui_response", id: message.requestId, values: message.values }
          : message.confirmed !== undefined
            ? { type: "extension_ui_response", id: message.requestId, confirmed: message.confirmed }
            : { type: "extension_ui_response", id: message.requestId, value: message.value || "" };

      await this.config.bridge.sendInput(uiResponse);
      this.send({ type: "response", id: message.id, success: true });
    } catch (error) {
      this.send({
        type: "response",
        id: message.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async forwardCommand(id: string, command: Record<string, unknown>): Promise<void> {
    try {
      const response = await this.config.bridge.sendInput(command as any);
      this.send({ type: "response", id, success: true, data: response });
    } catch (error) {
      this.send({
        type: "response",
        id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private forwardBridgeEvent(event: BridgeEvent): void {
    if (!this.attached) return;

    if (typeof event === "object" && event !== null && "type" in event) {
      if (event.type === "extension_ui_request") {
        const uiReq = event as RpcExtensionUIRequest;
        this.send({
          type: "extension_ui_request",
          requestId: uiReq.id,
          method: uiReq.method,
          title: uiReq.title,
          message: "message" in uiReq ? (uiReq as any).message : undefined,
          options: "options" in uiReq ? (uiReq as any).options : undefined,
          placeholder: "placeholder" in uiReq ? (uiReq as any).placeholder : undefined,
        });
        return;
      }

      if (event.type === "bridge_status") {
        this.sendBridgeStatus(this.config.bridge.getSnapshot());
        return;
      }
    }

    this.send({ type: "session_event", event });
  }

  private sendBridgeStatus(snapshot: BridgeRuntimeSnapshot): void {
    this.send({
      type: "bridge_status",
      phase: snapshot.phase,
      sessionId: snapshot.activeSessionId,
      sessionName: snapshot.sessionState?.sessionName,
      isStreaming: snapshot.sessionState?.isStreaming ?? false,
    });
  }

  private send(message: MobileServerMessage): void {
    if (this.ws.readyState !== WS_OPEN) return;
    this.ws.send(JSON.stringify(message));
  }

  private sendError(code: string, error: string): void {
    this.send({ type: "response", id: code, success: false, error });
  }

  cleanup(): void {
    if (this.unsubscribeBridge) {
      this.unsubscribeBridge();
      this.unsubscribeBridge = null;
    }
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.attached = false;
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  getDevice(): PairedDevice | null {
    return this.device;
  }

  isAlive(): boolean {
    return this.ws.readyState === WS_OPEN;
  }

  disconnect(reason?: string): void {
    this.send({ type: "server_shutdown", reason });
    this.cleanup();
    this.ws.close();
  }
}
