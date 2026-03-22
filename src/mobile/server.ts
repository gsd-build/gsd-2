/**
 * Mobile Socket Server
 *
 * Self-hosted WebSocket server for mobile access to GSD sessions.
 * Users run this on their own machine alongside the GSD web interface.
 *
 * Features:
 * - TLS support (self-signed or custom certs)
 * - Token-based device pairing
 * - Bridges to the existing BridgeService for session management
 * - Multiple concurrent mobile connections
 * - Automatic heartbeat/keepalive
 * - Zero external dependencies (uses built-in Node.js APIs)
 */

import { createServer as createHttpServer, type Server as HttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createHttpsServer, type Server as HttpsServer } from "node:https";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import type { Socket } from "node:net";

import { upgradeToWebSocket, type SimpleWebSocket } from "./websocket.ts";
import { MobileAuthManager } from "./auth.ts";
import { MobileConnection, type MobileConnectionConfig } from "./connection.ts";
import type { BridgeService } from "../web/bridge-service.ts";

export interface MobileSocketServerOptions {
  /** Port to listen on (default: 3001) */
  port?: number;
  /** Host to bind to (default: 0.0.0.0 for LAN access) */
  host?: string;
  /** Path to TLS certificate file */
  tlsCert?: string;
  /** Path to TLS key file */
  tlsKey?: string;
  /** GSD config directory (default: ~/.gsd) */
  gsdConfigDir?: string;
  /** Project working directory */
  projectCwd?: string;
  /** The BridgeService instance to proxy commands through */
  bridge: BridgeService;
  /** Maximum concurrent connections (default: 5) */
  maxConnections?: number;
  /** Server version string */
  version?: string;
}

export interface MobileSocketServerInfo {
  host: string;
  port: number;
  secure: boolean;
  pairingCode: string;
  pairingExpiresInSeconds: number;
  url: string;
}

export class MobileSocketServer {
  private httpServer: HttpServer | HttpsServer | null = null;
  private readonly connections = new Map<string, MobileConnection>();
  private readonly auth: MobileAuthManager;
  private readonly options: Required<Omit<MobileSocketServerOptions, "tlsCert" | "tlsKey" | "bridge">> & {
    tlsCert?: string;
    tlsKey?: string;
    bridge: BridgeService;
  };
  private connectionCounter = 0;

  constructor(options: MobileSocketServerOptions) {
    this.options = {
      port: options.port ?? 3001,
      host: options.host ?? "0.0.0.0",
      gsdConfigDir: options.gsdConfigDir ?? join(process.env.HOME || "~", ".gsd"),
      projectCwd: options.projectCwd ?? process.cwd(),
      maxConnections: options.maxConnections ?? 5,
      version: options.version ?? "1.0.0",
      bridge: options.bridge,
      tlsCert: options.tlsCert,
      tlsKey: options.tlsKey,
    };

    this.auth = new MobileAuthManager(this.options.gsdConfigDir);
  }

  /**
   * Start the WebSocket server.
   */
  async start(): Promise<MobileSocketServerInfo> {
    const secure = Boolean(this.options.tlsCert && this.options.tlsKey);

    // Create HTTP(S) server
    if (secure) {
      this.httpServer = createHttpsServer({
        cert: readFileSync(this.options.tlsCert!),
        key: readFileSync(this.options.tlsKey!),
      });
    } else {
      this.httpServer = createHttpServer();
    }

    // Handle regular HTTP requests (health check, pairing, device management)
    this.httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
      this.handleHttpRequest(req, res);
    });

    // Handle WebSocket upgrades
    this.httpServer.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
      this.handleUpgrade(req, socket, head);
    });

    // Start listening
    await new Promise<void>((resolve, reject) => {
      this.httpServer!.listen(this.options.port, this.options.host, () => resolve());
      this.httpServer!.on("error", reject);
    });

    // Generate initial pairing code
    const { code, expiresInSeconds } = this.auth.createPairingCode();
    const protocol = secure ? "wss" : "ws";
    const displayHost = this.options.host === "0.0.0.0" ? getLocalIP() : this.options.host;
    const url = `${protocol}://${displayHost}:${this.options.port}/mobile`;

    return {
      host: this.options.host,
      port: this.options.port,
      secure,
      pairingCode: code,
      pairingExpiresInSeconds: expiresInSeconds,
      url,
    };
  }

  /**
   * Stop the server and disconnect all clients.
   */
  async stop(): Promise<void> {
    for (const connection of this.connections.values()) {
      connection.disconnect("Server shutting down");
    }
    this.connections.clear();

    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }
  }

  /**
   * Generate a new pairing code (e.g., if the previous one expired).
   */
  generatePairingCode(): { code: string; expiresInSeconds: number } {
    return this.auth.createPairingCode();
  }

  /**
   * Get info about connected devices.
   */
  getConnectedDevices(): Array<{ id: string; name: string; platform: string }> {
    const devices: Array<{ id: string; name: string; platform: string }> = [];
    for (const conn of this.connections.values()) {
      const device = conn.getDevice();
      if (device && conn.isAlive()) {
        devices.push({
          id: device.id,
          name: device.name,
          platform: device.platform,
        });
      }
    }
    return devices;
  }

  /**
   * Revoke a device and disconnect it.
   */
  revokeDevice(deviceId: string): boolean {
    for (const [connId, conn] of this.connections) {
      if (conn.getDevice()?.id === deviceId) {
        conn.disconnect("Device revoked");
        this.connections.delete(connId);
      }
    }
    return this.auth.revokeDevice(deviceId);
  }

  private handleHttpRequest(req: IncomingMessage, res: ServerResponse): void {
    // Only allow local requests to management endpoints
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        connections: this.connections.size,
        maxConnections: this.options.maxConnections,
      }));
      return;
    }

    if (req.url === "/pair" && req.method === "POST") {
      const { code, expiresInSeconds } = this.auth.createPairingCode();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code, expiresInSeconds }));
      return;
    }

    if (req.url === "/devices" && req.method === "GET") {
      const devices = this.auth.listDevices().map((d) => ({
        id: d.id,
        name: d.name,
        platform: d.platform,
        pairedAt: d.pairedAt,
        lastSeenAt: d.lastSeenAt,
      }));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ devices }));
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  }

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    // Check connection limit
    if (this.connections.size >= this.options.maxConnections) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\n\r\n");
      socket.destroy();
      return;
    }

    const ws = upgradeToWebSocket(req, socket, head, "/mobile");
    if (!ws) return;

    const connId = `mobile-${++this.connectionCounter}`;
    const config: MobileConnectionConfig = {
      bridge: this.options.bridge,
      auth: this.auth,
      projectCwd: this.options.projectCwd,
      serverVersion: this.options.version,
    };

    const connection = new MobileConnection(connId, ws, config);
    this.connections.set(connId, connection);

    ws.on("close", () => {
      this.connections.delete(connId);
    });
  }
}

/**
 * Get the local network IP address for LAN access.
 */
function getLocalIP(): string {
  try {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]!) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch {
    // Fallback
  }
  return "localhost";
}
