/**
 * Mobile Socket CLI Launcher
 *
 * Provides the `gsd mobile` command for self-hosting the mobile socket server.
 * Handles server lifecycle, displays pairing codes, and manages devices.
 *
 * Usage:
 *   gsd mobile                    Start the mobile socket server
 *   gsd mobile --port 3001        Start on a specific port
 *   gsd mobile --tls              Enable TLS with auto-generated self-signed cert
 *   gsd mobile --tls-cert <path>  Use a custom TLS certificate
 *   gsd mobile --tls-key <path>   Use a custom TLS key
 *   gsd mobile pair               Generate a new pairing code
 *   gsd mobile devices            List paired devices
 *   gsd mobile revoke <id>        Revoke a device
 *   gsd mobile revoke-all         Revoke all devices
 */

import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";

import { MobileSocketServer, type MobileSocketServerOptions, type MobileSocketServerInfo } from "./server.ts";
import { MobileAuthManager } from "./auth.ts";

export interface MobileCLIOptions {
  command?: "start" | "pair" | "devices" | "revoke" | "revoke-all";
  port?: number;
  host?: string;
  tls?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  gsdConfigDir?: string;
  projectCwd?: string;
  revokeDeviceId?: string;
  /** BridgeService factory — the caller must provide this */
  createBridge: () => any;
  version?: string;
}

/**
 * Run the mobile CLI command.
 */
export async function runMobileCLI(options: MobileCLIOptions): Promise<void> {
  const gsdConfigDir = options.gsdConfigDir ?? join(process.env.HOME || "~", ".gsd");
  const command = options.command ?? "start";

  switch (command) {
    case "pair": {
      const auth = new MobileAuthManager(gsdConfigDir);
      const { code, expiresInSeconds } = auth.createPairingCode();
      console.log("");
      console.log("  Mobile Pairing Code");
      console.log("  ───────────────────");
      console.log(`  Code: ${formatPairingCode(code)}`);
      console.log(`  Expires in: ${expiresInSeconds} seconds`);
      console.log("");
      console.log("  Enter this code in your GSD mobile app to connect.");
      console.log("");
      return;
    }

    case "devices": {
      const auth = new MobileAuthManager(gsdConfigDir);
      const devices = auth.listDevices();
      if (devices.length === 0) {
        console.log("  No paired devices.");
        return;
      }

      console.log("");
      console.log("  Paired Devices");
      console.log("  ──────────────");
      for (const device of devices) {
        console.log(`  ${device.name} (${device.platform})`);
        console.log(`    ID: ${device.id}`);
        console.log(`    Paired: ${device.pairedAt}`);
        console.log(`    Last seen: ${device.lastSeenAt}`);
        console.log("");
      }
      return;
    }

    case "revoke": {
      if (!options.revokeDeviceId) {
        console.error("  Error: Device ID required. Use `gsd mobile devices` to list device IDs.");
        process.exitCode = 1;
        return;
      }
      const auth = new MobileAuthManager(gsdConfigDir);
      const revoked = auth.revokeDevice(options.revokeDeviceId);
      if (revoked) {
        console.log(`  Device ${options.revokeDeviceId} has been revoked.`);
      } else {
        console.log(`  Device ${options.revokeDeviceId} not found.`);
      }
      return;
    }

    case "revoke-all": {
      const auth = new MobileAuthManager(gsdConfigDir);
      auth.revokeAll();
      console.log("  All devices have been revoked.");
      return;
    }

    case "start": {
      await startMobileServer(options);
      return;
    }
  }
}

async function startMobileServer(options: MobileCLIOptions): Promise<void> {
  const gsdConfigDir = options.gsdConfigDir ?? join(process.env.HOME || "~", ".gsd");

  // Resolve TLS options
  let tlsCert = options.tlsCert;
  let tlsKey = options.tlsKey;

  if (options.tls && !tlsCert && !tlsKey) {
    // Auto-generate self-signed cert
    const certDir = join(gsdConfigDir, "mobile-tls");
    const certPath = join(certDir, "cert.pem");
    const keyPath = join(certDir, "key.pem");

    if (!existsSync(certPath) || !existsSync(keyPath)) {
      console.log("  Generating self-signed TLS certificate...");
      generateSelfSignedCert(certDir, certPath, keyPath);
    }

    tlsCert = certPath;
    tlsKey = keyPath;
  }

  // Create bridge
  const bridge = options.createBridge();

  const serverOptions: MobileSocketServerOptions = {
    port: options.port ?? 3001,
    host: options.host ?? "0.0.0.0",
    gsdConfigDir,
    projectCwd: options.projectCwd ?? process.cwd(),
    bridge,
    tlsCert,
    tlsKey,
    version: options.version,
  };

  const server = new MobileSocketServer(serverOptions);
  const info = await server.start();

  printServerBanner(info);

  // Handle shutdown
  const shutdown = async () => {
    console.log("\n  Shutting down mobile socket server...");
    await server.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Regenerate pairing code periodically
  const pairingInterval = setInterval(() => {
    const { code, expiresInSeconds } = server.generatePairingCode();
    console.log(`  New pairing code: ${formatPairingCode(code)} (expires in ${expiresInSeconds}s)`);
  }, 5 * 60 * 1000); // Every 5 minutes

  // Keep the process alive
  await new Promise<void>(() => {
    // Never resolves — server runs until signal
  });
}

function printServerBanner(info: MobileSocketServerInfo): void {
  const protocol = info.secure ? "wss" : "ws";

  console.log("");
  console.log("  ┌──────────────────────────────────────────┐");
  console.log("  │        GSD Mobile Socket Server          │");
  console.log("  └──────────────────────────────────────────┘");
  console.log("");
  console.log(`  Status:    Running`);
  console.log(`  URL:       ${info.url}`);
  console.log(`  Port:      ${info.port}`);
  console.log(`  Secure:    ${info.secure ? "Yes (TLS)" : "No (plaintext)"}`);
  console.log("");
  console.log("  ┌──────────────────────────────────────────┐");
  console.log("  │  Pairing Code                            │");
  console.log(`  │                                          │`);
  console.log(`  │     ${formatPairingCode(info.pairingCode)}                          │`);
  console.log(`  │                                          │`);
  console.log(`  │  Expires in ${info.pairingExpiresInSeconds}s                          │`);
  console.log("  └──────────────────────────────────────────┘");
  console.log("");
  console.log("  Enter this code in your GSD mobile app to connect.");
  if (!info.secure) {
    console.log("");
    console.log("  Warning: Running without TLS. Use --tls for encrypted connections.");
    console.log("  Recommended for LAN use only without TLS.");
  }
  console.log("");
  console.log("  Press Ctrl+C to stop the server.");
  console.log("");
}

function formatPairingCode(code: string): string {
  // Format as "XXX-XXX" for readability
  if (code.length === 6) {
    return `${code.slice(0, 3)}-${code.slice(3)}`;
  }
  return code;
}

function generateSelfSignedCert(certDir: string, certPath: string, keyPath: string): void {
  if (!existsSync(certDir)) {
    mkdirSync(certDir, { recursive: true, mode: 0o700 });
  }

  try {
    execSync(
      `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
      `-days 365 -nodes -subj "/CN=gsd-mobile/O=GSD/C=US" ` +
      `-addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
      { stdio: "pipe" },
    );
    console.log("  TLS certificate generated successfully.");
  } catch (error) {
    throw new Error(
      "Failed to generate self-signed certificate. Ensure openssl is installed, " +
      "or provide --tls-cert and --tls-key manually.",
    );
  }
}
