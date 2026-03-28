# Web Remote Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add password authentication with persistent cookie sessions, Tailscale Serve integration, and full event replay on reconnect to `gsd --web`.

**Architecture:** Cookie-based session auth (HMAC-signed, 30-day) layered on top of the existing bearer token mechanism. `tailscale serve` reverse-proxies HTTPS to the local Next.js server. Bridge events are logged to disk with monotonic sequence numbers; the SSE endpoint replays missed events on reconnect.

**Tech Stack:** Node.js `node:crypto` (scrypt for password hashing, HMAC-SHA256 for session signing), Next.js middleware, Tailscale CLI, JSONL event log.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/web/web-session-auth.ts` | Password hashing (scrypt), session token creation/verification (HMAC), session secret management |
| `src/web/tailscale.ts` | Tailscale CLI wrapper: status, serve, setup assistant helpers |
| `src/web/event-log.ts` | Append-only JSONL event log with sequence numbers, cursor-based read, rotation |
| `web/app/api/auth/login/route.ts` | POST endpoint — verify password, set session cookie |
| `web/app/api/auth/logout/route.ts` | POST endpoint — clear session cookie |
| `web/app/api/auth/status/route.ts` | GET endpoint — check if password auth is configured and session is valid (used by login gate) |
| `web/components/gsd/login-gate.tsx` | Login page component — GSD2 logo + password field |
| `web/lib/__tests__/web-session-auth.test.ts` | Tests for password hashing and session token signing |
| `src/web/__tests__/event-log.test.ts` | Tests for event log append, read-from-cursor, rotation |
| `src/web/__tests__/tailscale.test.ts` | Tests for Tailscale status parsing and serve command building |

### Modified Files

| File | What Changes |
|------|-------------|
| `web/proxy.ts` | Add cookie session validation before bearer token check |
| `web/lib/auth.ts` | Add `isAuthenticated()` that checks cookie OR token, `clearAuth()` for logout |
| `web/app/api/session/events/route.ts` | Accept `since` query param, replay from event log cursor before switching to live |
| `web/lib/gsd-workspace-store.tsx` | Track `lastSeqNo` in localStorage, send `since` param on reconnect |
| `src/cli-web-branch.ts` | Parse `--tailscale` flag |
| `src/web-mode.ts` | Tailscale preflight checks, `tailscale serve` lifecycle, daemon mode, cleanup on exit |
| `src/web/bridge-service.ts` | Pipe emitted events to the event log |
| `web/app/page.tsx` | Wrap app shell with login gate |

---

## Task 1: Password Hashing & Session Token Module

**Files:**
- Create: `src/web/web-session-auth.ts`
- Test: `web/lib/__tests__/web-session-auth.test.ts`

This module handles all crypto: scrypt password hashing, HMAC session token signing/verification, and session secret management.

- [ ] **Step 1: Write failing tests for password hashing**

Create `web/lib/__tests__/web-session-auth.test.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { hashPassword, verifyPassword } from "../../../src/web/web-session-auth.ts";

describe("web-session-auth", () => {
  describe("password hashing", () => {
    test("hashPassword returns a string containing salt and hash", async () => {
      const hash = await hashPassword("test-password");
      assert.equal(typeof hash, "string");
      // Format: <salt-hex>:<hash-hex>
      const parts = hash.split(":");
      assert.equal(parts.length, 2);
      assert.ok(parts[0].length > 0, "salt must not be empty");
      assert.ok(parts[1].length > 0, "hash must not be empty");
    });

    test("verifyPassword returns true for correct password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("correct-password", hash);
      assert.equal(result, true);
    });

    test("verifyPassword returns false for wrong password", async () => {
      const hash = await hashPassword("correct-password");
      const result = await verifyPassword("wrong-password", hash);
      assert.equal(result, false);
    });

    test("hashPassword produces different hashes for same password (random salt)", async () => {
      const hash1 = await hashPassword("same-password");
      const hash2 = await hashPassword("same-password");
      assert.notEqual(hash1, hash2);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test web/lib/__tests__/web-session-auth.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement password hashing**

Create `src/web/web-session-auth.ts`:

```typescript
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { appRoot } from "../app-paths.ts";

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;

/**
 * Hash a plaintext password using scrypt with a random salt.
 * Returns `<salt-hex>:<hash-hex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

/**
 * Verify a plaintext password against a stored `<salt-hex>:<hash-hex>` string.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const storedHash = Buffer.from(hashHex, "hex");
  const candidateHash = (await scryptAsync(password, salt, SCRYPT_KEYLEN)) as Buffer;

  return timingSafeEqual(storedHash, candidateHash);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test web/lib/__tests__/web-session-auth.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Add session token tests**

Append to `web/lib/__tests__/web-session-auth.test.ts`:

```typescript
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "../../../src/web/web-session-auth.ts";

// ... inside the outer describe block, add:

  describe("session tokens", () => {
    const secret = "test-secret-key-for-hmac";

    test("createSessionToken returns a non-empty string", () => {
      const token = createSessionToken(secret, 30);
      assert.equal(typeof token, "string");
      assert.ok(token.length > 0);
    });

    test("verifySessionToken returns payload for valid token", () => {
      const token = createSessionToken(secret, 30);
      const result = verifySessionToken(token, secret);
      assert.notEqual(result, null);
      assert.ok(result!.createdAt > 0);
      assert.ok(result!.expiresAt > result!.createdAt);
    });

    test("verifySessionToken returns null for tampered token", () => {
      const token = createSessionToken(secret, 30);
      const tampered = token.slice(0, -4) + "xxxx";
      const result = verifySessionToken(tampered, secret);
      assert.equal(result, null);
    });

    test("verifySessionToken returns null for wrong secret", () => {
      const token = createSessionToken(secret, 30);
      const result = verifySessionToken(token, "wrong-secret");
      assert.equal(result, null);
    });

    test("verifySessionToken returns null for expired token", () => {
      // Create a token that expired 1 day ago
      const token = createSessionToken(secret, -1);
      const result = verifySessionToken(token, secret);
      assert.equal(result, null);
    });
  });
```

- [ ] **Step 6: Run tests to verify new tests fail**

Run: `node --test web/lib/__tests__/web-session-auth.test.ts`
Expected: FAIL — createSessionToken/verifySessionToken not exported

- [ ] **Step 7: Implement session token creation and verification**

Append to `src/web/web-session-auth.ts`:

```typescript
interface SessionPayload {
  createdAt: number;
  expiresAt: number;
}

/**
 * Create a signed session token. The token is a base64-encoded JSON payload
 * with an HMAC-SHA256 signature appended.
 * Format: <base64-payload>.<hex-signature>
 */
export function createSessionToken(secret: string, daysValid: number): string {
  const now = Date.now();
  const payload: SessionPayload = {
    createdAt: now,
    expiresAt: now + daysValid * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(payloadB64).digest("hex");
  return `${payloadB64}.${signature}`;
}

/**
 * Verify a signed session token. Returns the payload if valid and not expired,
 * or null otherwise.
 */
export function verifySessionToken(token: string, secret: string): SessionPayload | null {
  const dotIndex = token.indexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const signature = token.slice(dotIndex + 1);

  const expectedSignature = createHmac("sha256", secret).update(payloadB64).digest("hex");
  if (signature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) return null;

  try {
    const payload: SessionPayload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `node --test web/lib/__tests__/web-session-auth.test.ts`
Expected: 9 tests PASS

- [ ] **Step 9: Add session secret management**

Add tests to the test file:

```typescript
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
  getOrCreateSessionSecret,
  rotateSessionSecret,
} from "../../../src/web/web-session-auth.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ... inside the outer describe block, add:

  describe("session secret management", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "gsd-auth-test-"));
    });

    afterEach(async () => {
      await rm(tempDir, { recursive: true, force: true });
    });

    test("getOrCreateSessionSecret creates and returns a secret", async () => {
      const secret = await getOrCreateSessionSecret(tempDir);
      assert.equal(typeof secret, "string");
      assert.ok(secret.length >= 32, "secret should be at least 32 chars");
    });

    test("getOrCreateSessionSecret returns same secret on subsequent calls", async () => {
      const secret1 = await getOrCreateSessionSecret(tempDir);
      const secret2 = await getOrCreateSessionSecret(tempDir);
      assert.equal(secret1, secret2);
    });

    test("rotateSessionSecret changes the secret", async () => {
      const secret1 = await getOrCreateSessionSecret(tempDir);
      const secret2 = await rotateSessionSecret(tempDir);
      assert.notEqual(secret1, secret2);
    });
  });
```

- [ ] **Step 10: Implement session secret management**

Append to `src/web/web-session-auth.ts`:

```typescript
const SECRET_FILENAME = "web-session-secret";

/**
 * Get or create the session signing secret. Creates the file on first call.
 * The secret is a 64-character hex string stored at `<gsdDir>/web-session-secret`.
 */
export async function getOrCreateSessionSecret(gsdDir?: string): Promise<string> {
  const dir = gsdDir ?? appRoot;
  const secretPath = join(dir, SECRET_FILENAME);

  try {
    const existing = await readFile(secretPath, "utf-8");
    const trimmed = existing.trim();
    if (trimmed.length >= 32) return trimmed;
  } catch {
    // File doesn't exist — create it
  }

  const secret = randomBytes(32).toString("hex");
  await mkdir(dir, { recursive: true });
  await writeFile(secretPath, secret, { mode: 0o600 });
  return secret;
}

/**
 * Rotate the session signing secret. This invalidates all existing sessions.
 */
export async function rotateSessionSecret(gsdDir?: string): Promise<string> {
  const dir = gsdDir ?? appRoot;
  const secretPath = join(dir, SECRET_FILENAME);
  const secret = randomBytes(32).toString("hex");
  await mkdir(dir, { recursive: true });
  await writeFile(secretPath, secret, { mode: 0o600 });
  return secret;
}
```

- [ ] **Step 11: Run all tests**

Run: `node --test web/lib/__tests__/web-session-auth.test.ts`
Expected: 12 tests PASS

- [ ] **Step 12: Commit**

```bash
git add src/web/web-session-auth.ts web/lib/__tests__/web-session-auth.test.ts
git commit -m "feat(web): add password hashing and session token module"
```

---

## Task 2: Event Log Module

**Files:**
- Create: `src/web/event-log.ts`
- Test: `src/web/__tests__/event-log.test.ts`

Append-only JSONL event log with monotonic sequence numbers, cursor-based reads, and rotation.

- [ ] **Step 1: Write failing tests**

Create `src/web/__tests__/event-log.test.ts`:

```typescript
import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EventLog } from "../event-log.ts";

describe("EventLog", () => {
  let tempDir: string;
  let log: EventLog;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gsd-eventlog-test-"));
    log = new EventLog(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("append assigns monotonically increasing sequence numbers", async () => {
    const seq1 = await log.append({ type: "bridge_status", data: "a" });
    const seq2 = await log.append({ type: "bridge_status", data: "b" });
    const seq3 = await log.append({ type: "bridge_status", data: "c" });
    assert.equal(seq1, 1);
    assert.equal(seq2, 2);
    assert.equal(seq3, 3);
  });

  test("readSince returns events after the given sequence number", async () => {
    await log.append({ type: "a" });
    await log.append({ type: "b" });
    await log.append({ type: "c" });

    const events = await log.readSince(1);
    assert.equal(events.length, 2);
    assert.equal(events[0].seq, 2);
    assert.equal(events[0].event.type, "b");
    assert.equal(events[1].seq, 3);
    assert.equal(events[1].event.type, "c");
  });

  test("readSince(0) returns all events", async () => {
    await log.append({ type: "a" });
    await log.append({ type: "b" });
    const events = await log.readSince(0);
    assert.equal(events.length, 2);
  });

  test("readSince returns empty array when cursor is current", async () => {
    await log.append({ type: "a" });
    const events = await log.readSince(1);
    assert.equal(events.length, 0);
  });

  test("currentSeq returns 0 for empty log", () => {
    assert.equal(log.currentSeq, 0);
  });

  test("currentSeq returns last sequence number after appends", async () => {
    await log.append({ type: "a" });
    await log.append({ type: "b" });
    assert.equal(log.currentSeq, 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/web/__tests__/event-log.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement EventLog**

Create `src/web/event-log.ts`:

```typescript
import { appendFile, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

export interface LogEntry {
  seq: number;
  event: unknown;
}

const LOG_FILENAME = "events.jsonl";
const MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ROTATE_TARGET_BYTES = 10 * 1024 * 1024; // 10MB

export class EventLog {
  private dir: string;
  private filePath: string;
  private seq = 0;

  constructor(dir: string) {
    this.dir = dir;
    this.filePath = join(dir, LOG_FILENAME);
  }

  get currentSeq(): number {
    return this.seq;
  }

  /**
   * Append an event to the log. Returns the assigned sequence number.
   */
  async append(event: unknown): Promise<number> {
    this.seq++;
    const entry: LogEntry = { seq: this.seq, event };
    await mkdir(this.dir, { recursive: true });
    await appendFile(this.filePath, JSON.stringify(entry) + "\n");
    return this.seq;
  }

  /**
   * Read all events with sequence numbers greater than `sinceSeq`.
   * Returns an empty array if the cursor is current or the log is empty.
   */
  async readSince(sinceSeq: number): Promise<LogEntry[]> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf-8");
    } catch {
      return [];
    }

    const entries: LogEntry[] = [];
    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry: LogEntry = JSON.parse(line);
        if (entry.seq > sinceSeq) {
          entries.push(entry);
        }
      } catch {
        // Skip malformed lines
      }
    }
    return entries;
  }

  /**
   * Rotate the log if it exceeds MAX_SIZE_BYTES.
   * Keeps only the most recent ROTATE_TARGET_BYTES of data.
   * Returns true if rotation occurred.
   */
  async rotateIfNeeded(): Promise<boolean> {
    let size: number;
    try {
      const s = await stat(this.filePath);
      size = s.size;
    } catch {
      return false;
    }

    if (size <= MAX_SIZE_BYTES) return false;

    const content = await readFile(this.filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());

    // Keep lines from the end until we reach ROTATE_TARGET_BYTES
    let kept: string[] = [];
    let keptSize = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineSize = Buffer.byteLength(lines[i]) + 1; // +1 for newline
      if (keptSize + lineSize > ROTATE_TARGET_BYTES) break;
      kept.unshift(lines[i]);
      keptSize += lineSize;
    }

    await writeFile(this.filePath, kept.join("\n") + "\n");
    return true;
  }

  /**
   * Get the oldest sequence number still in the log, or null if empty.
   */
  async oldestSeq(): Promise<number | null> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf-8");
    } catch {
      return null;
    }

    for (const line of content.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry: LogEntry = JSON.parse(line);
        return entry.seq;
      } catch {
        continue;
      }
    }
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/web/__tests__/event-log.test.ts`
Expected: 6 tests PASS

- [ ] **Step 5: Add rotation tests**

Append to `src/web/__tests__/event-log.test.ts`:

```typescript
  test("rotateIfNeeded returns false when log is small", async () => {
    await log.append({ type: "a" });
    const rotated = await log.rotateIfNeeded();
    assert.equal(rotated, false);
  });

  test("oldestSeq returns null for empty log", async () => {
    const oldest = await log.oldestSeq();
    assert.equal(oldest, null);
  });

  test("oldestSeq returns first sequence number", async () => {
    await log.append({ type: "a" });
    await log.append({ type: "b" });
    const oldest = await log.oldestSeq();
    assert.equal(oldest, 1);
  });
```

- [ ] **Step 6: Run all tests**

Run: `node --test src/web/__tests__/event-log.test.ts`
Expected: 9 tests PASS

- [ ] **Step 7: Commit**

```bash
git add src/web/event-log.ts src/web/__tests__/event-log.test.ts
git commit -m "feat(web): add JSONL event log with cursor-based replay"
```

---

## Task 3: Tailscale CLI Wrapper

**Files:**
- Create: `src/web/tailscale.ts`
- Test: `src/web/__tests__/tailscale.test.ts`

Wraps the Tailscale CLI for status checking, serve management, and setup assistance.

- [ ] **Step 1: Write failing tests**

Create `src/web/__tests__/tailscale.test.ts`:

```typescript
import { describe, test } from "node:test";
import assert from "node:assert/strict";

import {
  parseTailscaleStatus,
  buildServeCommand,
  buildServeResetCommand,
  getInstallCommand,
} from "../tailscale.ts";

describe("tailscale", () => {
  describe("parseTailscaleStatus", () => {
    test("extracts hostname and tailnet from status JSON", () => {
      const statusJson = {
        Self: {
          HostName: "my-server",
          DNSName: "my-server.tail12345.ts.net.",
        },
        MagicDNSSuffix: "tail12345.ts.net",
      };
      const result = parseTailscaleStatus(statusJson);
      assert.equal(result.hostname, "my-server");
      assert.equal(result.tailnet, "tail12345.ts.net");
      assert.equal(result.fqdn, "my-server.tail12345.ts.net");
      assert.equal(result.url, "https://my-server.tail12345.ts.net");
    });

    test("strips trailing dot from DNSName", () => {
      const statusJson = {
        Self: {
          HostName: "box",
          DNSName: "box.example.ts.net.",
        },
        MagicDNSSuffix: "example.ts.net",
      };
      const result = parseTailscaleStatus(statusJson);
      assert.equal(result.fqdn, "box.example.ts.net");
    });
  });

  describe("buildServeCommand", () => {
    test("builds correct tailscale serve command", () => {
      const args = buildServeCommand(3456);
      assert.deepEqual(args, [
        "serve", "--bg", "--https", "443",
        "https+insecure://127.0.0.1:3456",
      ]);
    });
  });

  describe("buildServeResetCommand", () => {
    test("builds reset command", () => {
      const args = buildServeResetCommand();
      assert.deepEqual(args, ["serve", "reset"]);
    });
  });

  describe("getInstallCommand", () => {
    test("returns brew command for darwin", () => {
      const cmd = getInstallCommand("darwin");
      assert.ok(cmd.includes("brew"));
    });

    test("returns install script for linux", () => {
      const cmd = getInstallCommand("linux");
      assert.ok(cmd.includes("tailscale.com/install.sh"));
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test src/web/__tests__/tailscale.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement Tailscale wrapper**

Create `src/web/tailscale.ts`:

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface TailscaleInfo {
  hostname: string;
  tailnet: string;
  fqdn: string;
  url: string;
}

/**
 * Parse the output of `tailscale status --json` into structured info.
 */
export function parseTailscaleStatus(statusJson: {
  Self: { HostName: string; DNSName: string };
  MagicDNSSuffix: string;
}): TailscaleInfo {
  const hostname = statusJson.Self.HostName;
  const tailnet = statusJson.MagicDNSSuffix;
  const fqdn = statusJson.Self.DNSName.replace(/\.$/, "");
  return {
    hostname,
    tailnet,
    fqdn,
    url: `https://${fqdn}`,
  };
}

/**
 * Build the args array for `tailscale serve --bg`.
 */
export function buildServeCommand(localPort: number): string[] {
  return [
    "serve", "--bg", "--https", "443",
    `https+insecure://127.0.0.1:${localPort}`,
  ];
}

/**
 * Build the args array for `tailscale serve reset`.
 */
export function buildServeResetCommand(): string[] {
  return ["serve", "reset"];
}

/**
 * Get the install command for the current platform.
 */
export function getInstallCommand(platform: string): string {
  if (platform === "darwin") {
    return "brew install tailscale";
  }
  return "curl -fsSL https://tailscale.com/install.sh | sh";
}

/**
 * Check if the `tailscale` CLI is available on PATH.
 */
export async function isTailscaleInstalled(): Promise<boolean> {
  try {
    await execFileAsync("tailscale", ["version"]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Tailscale is connected and return status info.
 * Returns null if not connected or CLI not available.
 */
export async function getTailscaleStatus(): Promise<TailscaleInfo | null> {
  try {
    const { stdout } = await execFileAsync("tailscale", ["status", "--json"]);
    const statusJson = JSON.parse(stdout);
    return parseTailscaleStatus(statusJson);
  } catch {
    return null;
  }
}

/**
 * Start `tailscale serve` to reverse-proxy HTTPS to a local port.
 */
export async function startTailscaleServe(localPort: number): Promise<void> {
  const args = buildServeCommand(localPort);
  await execFileAsync("tailscale", args);
}

/**
 * Stop `tailscale serve` and remove the configuration.
 */
export async function stopTailscaleServe(): Promise<void> {
  try {
    const args = buildServeResetCommand();
    await execFileAsync("tailscale", args);
  } catch {
    // Best-effort cleanup — the serve entry is harmless if left behind
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test src/web/__tests__/tailscale.test.ts`
Expected: 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/web/tailscale.ts src/web/__tests__/tailscale.test.ts
git commit -m "feat(web): add Tailscale CLI wrapper for serve integration"
```

---

## Task 4: Proxy Middleware — Add Cookie Auth

**Files:**
- Modify: `web/proxy.ts`

Add session cookie validation as a third auth method, checked before the bearer token. The `/api/auth/login` endpoint must be exempt from auth (otherwise you can't log in).

- [ ] **Step 1: Read the current proxy.ts**

Read `web/proxy.ts` to confirm current state matches expectations (81 lines, exports `proxy` + `config`).

- [ ] **Step 2: Modify proxy.ts to add cookie session check**

Replace the bearer token check section in `web/proxy.ts`. The full updated file:

```typescript
import { NextResponse, type NextRequest } from "next/server"
import { verifySessionToken } from "../src/web/web-session-auth.ts"

/**
 * Next.js proxy — validates session cookie, bearer token, or query param
 * on all API routes.
 *
 * Auth methods (checked in order):
 * 1. Session cookie (`gsd-session`) — HMAC-signed, used over Tailscale HTTPS
 * 2. Authorization: Bearer header — per-instance random token, used on localhost
 * 3. `_token` query parameter — fallback for EventSource/SSE (no custom headers)
 */
export function proxy(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl

  // Only gate API routes
  if (!pathname.startsWith("/api/")) return NextResponse.next()

  // Auth endpoints are always accessible (login page needs them)
  if (pathname.startsWith("/api/auth/")) return NextResponse.next()

  const expectedToken = process.env.GSD_WEB_AUTH_TOKEN
  if (!expectedToken) {
    // No token configured (dev mode) — allow everything
    return NextResponse.next()
  }

  // ── Origin / CORS check ────────────────────────────────────────────
  const origin = request.headers.get("origin")
  if (origin) {
    const host = process.env.GSD_WEB_HOST || "127.0.0.1"
    const port = process.env.GSD_WEB_PORT || "3000"

    const allowed = new Set([`http://${host}:${port}`])

    const extra = process.env.GSD_WEB_ALLOWED_ORIGINS
    if (extra) {
      for (const entry of extra.split(",")) {
        const trimmed = entry.trim()
        if (trimmed) allowed.add(trimmed)
      }
    }

    if (!allowed.has(origin)) {
      return NextResponse.json(
        { error: "Forbidden: origin mismatch" },
        { status: 403 },
      )
    }
  }

  // ── 1. Session cookie check ──────────────────────────────────────────
  const sessionCookie = request.cookies.get("gsd-session")?.value
  if (sessionCookie) {
    const sessionSecret = process.env.GSD_WEB_SESSION_SECRET
    if (sessionSecret) {
      const payload = verifySessionToken(sessionCookie, sessionSecret)
      if (payload) return NextResponse.next()
    }
  }

  // ── 2. Bearer token check ────────────────────────────────────────────
  let token: string | null = null

  const authHeader = request.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7)
  }

  // ── 3. Query parameter fallback for EventSource / SSE ────────────────
  if (!token) {
    token = request.nextUrl.searchParams.get("_token")
  }

  if (!token || token !== expectedToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 },
    )
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/api/:path*",
}
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `node --test web/lib/__tests__/`
Expected: All existing tests PASS

- [ ] **Step 4: Commit**

```bash
git add web/proxy.ts
git commit -m "feat(web): add cookie session auth to proxy middleware"
```

---

## Task 5: Auth API Endpoints

**Files:**
- Create: `web/app/api/auth/login/route.ts`
- Create: `web/app/api/auth/logout/route.ts`
- Create: `web/app/api/auth/status/route.ts`

- [ ] **Step 1: Create login endpoint**

Create `web/app/api/auth/login/route.ts`:

```typescript
import { NextResponse } from "next/server";
import {
  verifyPassword,
  createSessionToken,
} from "../../../../../src/web/web-session-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Simple in-memory rate limiter: max 5 attempts per minute */
const attempts: number[] = [];
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function isRateLimited(): boolean {
  const now = Date.now();
  // Remove entries older than the window
  while (attempts.length > 0 && attempts[0] < now - WINDOW_MS) {
    attempts.shift();
  }
  return attempts.length >= MAX_ATTEMPTS;
}

export async function POST(request: Request): Promise<Response> {
  if (isRateLimited()) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again in a minute." },
      { status: 429 },
    );
  }
  attempts.push(Date.now());

  const passwordHash = process.env.GSD_WEB_PASSWORD_HASH;
  if (!passwordHash) {
    return NextResponse.json(
      { error: "Password auth not configured" },
      { status: 503 },
    );
  }

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!body.password || typeof body.password !== "string") {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const valid = await verifyPassword(body.password, passwordHash);
  if (!valid) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const sessionSecret = process.env.GSD_WEB_SESSION_SECRET;
  if (!sessionSecret) {
    return NextResponse.json(
      { error: "Session secret not configured" },
      { status: 500 },
    );
  }

  const token = createSessionToken(sessionSecret, 30);

  const response = NextResponse.json({ ok: true });
  response.cookies.set("gsd-session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
    path: "/",
  });

  return response;
}
```

- [ ] **Step 2: Create logout endpoint**

Create `web/app/api/auth/logout/route.ts`:

```typescript
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set("gsd-session", "", {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  });
  return response;
}
```

- [ ] **Step 3: Create status endpoint**

Create `web/app/api/auth/status/route.ts`:

```typescript
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken } from "../../../../../src/web/web-session-auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<Response> {
  const passwordHash = process.env.GSD_WEB_PASSWORD_HASH;
  const passwordConfigured = !!passwordHash;

  // If no password is configured, auth is not required
  if (!passwordConfigured) {
    return NextResponse.json({
      passwordConfigured: false,
      authenticated: true,
    });
  }

  // Check session cookie
  const sessionCookie = request.cookies.get("gsd-session")?.value;
  const sessionSecret = process.env.GSD_WEB_SESSION_SECRET;
  let authenticated = false;

  if (sessionCookie && sessionSecret) {
    const payload = verifySessionToken(sessionCookie, sessionSecret);
    authenticated = payload !== null;
  }

  // Also check bearer token (localhost flow)
  if (!authenticated) {
    const expectedToken = process.env.GSD_WEB_AUTH_TOKEN;
    const authHeader = request.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ") && expectedToken) {
      authenticated = authHeader.slice(7) === expectedToken;
    }
  }

  return NextResponse.json({
    passwordConfigured: true,
    authenticated,
  });
}
```

- [ ] **Step 4: Commit**

```bash
git add web/app/api/auth/
git commit -m "feat(web): add login, logout, and status API endpoints"
```

---

## Task 6: Login Gate Component

**Files:**
- Create: `web/components/gsd/login-gate.tsx`
- Modify: `web/app/page.tsx`

- [ ] **Step 1: Create the login gate component**

Create `web/components/gsd/login-gate.tsx`:

```tsx
"use client"

import { useCallback, useEffect, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface LoginGateProps {
  children: React.ReactNode
}

type AuthStatus = "loading" | "authenticated" | "needs-login" | "no-password"

export function LoginGate({ children }: LoginGateProps) {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [shaking, setShaking] = useState(false)

  useEffect(() => {
    checkAuthStatus()
  }, [])

  async function checkAuthStatus() {
    try {
      const res = await fetch("/api/auth/status")
      if (!res.ok) {
        // Auth endpoints not available — skip login gate (localhost mode)
        setStatus("authenticated")
        return
      }
      const data = await res.json()
      if (!data.passwordConfigured) {
        setStatus("no-password")
      } else if (data.authenticated) {
        setStatus("authenticated")
      } else {
        setStatus("needs-login")
      }
    } catch {
      // Network error or server not ready — skip gate
      setStatus("authenticated")
    }
  }

  const handleLogin = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setStatus("authenticated")
      } else {
        const data = await res.json()
        setError(data.error || "Login failed")
        setShaking(true)
        setTimeout(() => setShaking(false), 600)
      }
    } catch {
      setError("Connection error")
    }
  }, [password])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleLogin()
    },
    [handleLogin],
  )

  // Skip gate for unauthenticated or no-password states
  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (status === "authenticated" || status === "no-password") {
    return <>{children}</>
  }

  // Login form
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div
        className={cn(
          "flex w-80 flex-col items-center gap-6 rounded-lg border border-border bg-card p-8 shadow-lg",
          shaking && "animate-shake",
        )}
      >
        <Image
          src="/gsd-logo.svg"
          alt="GSD"
          width={48}
          height={48}
          className="opacity-80"
          priority
        />

        <div className="w-full space-y-4">
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />

          <button
            onClick={handleLogin}
            disabled={!password}
            className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Log in
          </button>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add shake animation to globals.css**

Add to `web/app/globals.css` (at the end, within the Tailwind layer or as a utility):

```css
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-6px); }
  40% { transform: translateX(6px); }
  60% { transform: translateX(-4px); }
  80% { transform: translateX(4px); }
}

.animate-shake {
  animation: shake 0.5s ease-in-out;
}
```

- [ ] **Step 3: Wrap page.tsx with login gate**

Modify `web/app/page.tsx` to wrap the dynamic import with the login gate:

```tsx
import dynamic from "next/dynamic"
import { LoginGate } from "@/components/gsd/login-gate"

const GSDAppShell = dynamic(
  () => import("@/components/gsd/app-shell").then((mod) => mod.GSDAppShell),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading workspace…
      </div>
    ),
  },
)

export default function Page() {
  return (
    <LoginGate>
      <GSDAppShell />
    </LoginGate>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add web/components/gsd/login-gate.tsx web/app/globals.css web/app/page.tsx
git commit -m "feat(web): add login gate with GSD logo and password prompt"
```

---

## Task 7: Client-Side Auth Updates

**Files:**
- Modify: `web/lib/auth.ts`

Add `isAuthenticated()` for the login gate to use with cookie awareness, and `clearAuth()` for logout.

- [ ] **Step 1: Add new functions to auth.ts**

Append to `web/lib/auth.ts` before the closing of the file:

```typescript
/**
 * Clear the cached auth token and localStorage entry.
 * Used during logout to ensure the client forgets credentials.
 */
export function clearAuth(): void {
  cachedToken = null
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY)
  } catch {
    // Storage unavailable
  }
}

/**
 * Perform logout: clear local auth state and call the logout endpoint.
 * Reloads the page after logout to reset all client state.
 */
export async function logout(): Promise<void> {
  clearAuth()
  try {
    await fetch("/api/auth/logout", { method: "POST" })
  } catch {
    // Best-effort
  }
  window.location.reload()
}
```

- [ ] **Step 2: Commit**

```bash
git add web/lib/auth.ts
git commit -m "feat(web): add clearAuth and logout to client auth module"
```

---

## Task 8: Event Replay in SSE Endpoint

**Files:**
- Modify: `web/app/api/session/events/route.ts`
- Modify: `src/web/bridge-service.ts`
- Modify: `web/lib/gsd-workspace-store.tsx`

Wire the event log into the bridge service and add cursor-based replay to the SSE endpoint.

- [ ] **Step 1: Add event log integration to bridge service**

In `src/web/bridge-service.ts`, import the EventLog and integrate it with the emit method. Find the `BridgeService` class constructor area and add:

```typescript
import { EventLog } from "./event-log.ts";
```

Add a property to the `BridgeService` class:

```typescript
private eventLog: EventLog | null = null;
```

Add an initialization method:

```typescript
initEventLog(dir: string): void {
  this.eventLog = new EventLog(dir);
}
```

Modify the existing `emit` method to also log events:

```typescript
private emit(event: BridgeEvent): void {
  // Log to persistent event log (fire-and-forget)
  this.eventLog?.append(event).catch(() => {});

  for (const subscriber of this.subscribers) {
    try {
      subscriber(event);
    } catch {
      // Subscriber failures should not break delivery
    }
  }
}
```

Add a public getter for the event log:

```typescript
getEventLog(): EventLog | null {
  return this.eventLog;
}
```

- [ ] **Step 2: Modify SSE endpoint for cursor-based replay**

Replace `web/app/api/session/events/route.ts` with:

```typescript
import {
  collectCurrentProjectOnboardingState,
  getProjectBridgeServiceForCwd,
  requireProjectCwd,
} from "../../../../../src/web/bridge-service.ts";
import { cancelShutdown } from "../../../../lib/shutdown-gate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function encodeSseData(payload: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

export async function GET(request: Request): Promise<Response> {
  cancelShutdown();

  const projectCwd = requireProjectCwd(request);
  const bridge = getProjectBridgeServiceForCwd(projectCwd);
  const onboarding = await collectCurrentProjectOnboardingState(projectCwd);

  if (onboarding.locked) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    await bridge.ensureStarted();
  } catch {
    // Keep stream open — initial bridge_status event surfaces the failure
  }

  // Parse optional cursor for replay
  const url = new URL(request.url);
  const sinceParam = url.searchParams.get("since");
  const sinceSeq = sinceParam ? parseInt(sinceParam, 10) : null;

  let unsubscribe: (() => void) | null = null;
  let closed = false;

  const closeWith = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    unsubscribe?.();
    unsubscribe = null;
    controller.close();
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Replay missed events if a cursor was provided
      if (sinceSeq !== null && !isNaN(sinceSeq)) {
        const eventLog = bridge.getEventLog();
        if (eventLog) {
          const oldest = await eventLog.oldestSeq();
          if (oldest !== null && sinceSeq >= oldest) {
            // Cursor is within log range — replay
            const missed = await eventLog.readSince(sinceSeq);
            for (const entry of missed) {
              if (closed) return;
              controller.enqueue(encodeSseData(entry.event));
            }
          }
          // If cursor is older than oldest log entry, skip replay.
          // Client will get a full state refresh via boot.
        }
      }

      // Subscribe to live events
      unsubscribe = bridge.subscribe((event) => {
        if (closed) return;
        const eventLog = bridge.getEventLog();
        const seq = eventLog?.currentSeq ?? 0;
        // Include sequence number in the event for client tracking
        controller.enqueue(encodeSseData({ ...event, _seq: seq }));
      });

      request.signal.addEventListener("abort", () => closeWith(controller), { once: true });
    },
    cancel() {
      if (closed) return;
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
```

- [ ] **Step 3: Update workspace store to track sequence numbers**

In `web/lib/gsd-workspace-store.tsx`, modify the `ensureEventStream` method:

In the EventSource URL construction, add the `since` parameter:

```typescript
private ensureEventStream(): void {
  if (this.eventSource || this.disposed || this.state.boot?.onboarding.locked) return

  // Include last-seen sequence number for replay
  let url = this.buildUrl("/api/session/events")
  const lastSeq = this.getLastSeqNo()
  if (lastSeq > 0) {
    url += `?since=${lastSeq}`
  }

  const stream = new EventSource(appendAuthParam(url))
  // ... rest of existing code
```

In the `onmessage` handler, track the sequence number:

```typescript
stream.onmessage = (message) => {
  const parsed: unknown = JSON.parse(message.data)
  if (!isWorkspaceEvent(parsed)) return
  // Track sequence number for replay on reconnect
  if (typeof (parsed as Record<string, unknown>)._seq === "number") {
    this.saveLastSeqNo((parsed as Record<string, unknown>)._seq as number)
  }
  this.handleEvent(parsed)
}
```

Add helper methods for localStorage persistence:

```typescript
private getLastSeqNo(): number {
  try {
    const stored = localStorage.getItem("gsd-last-seq")
    return stored ? parseInt(stored, 10) : 0
  } catch {
    return 0
  }
}

private saveLastSeqNo(seq: number): void {
  try {
    localStorage.setItem("gsd-last-seq", String(seq))
  } catch {
    // Storage unavailable
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/web/bridge-service.ts web/app/api/session/events/route.ts web/lib/gsd-workspace-store.tsx
git commit -m "feat(web): add cursor-based event replay on SSE reconnect"
```

---

## Task 9: Tailscale Integration in Web Mode Launch

**Files:**
- Modify: `src/cli-web-branch.ts`
- Modify: `src/web-mode.ts`

Add `--tailscale` flag parsing and Tailscale Serve lifecycle management.

- [ ] **Step 1: Add --tailscale flag parsing to CLI**

In `src/cli-web-branch.ts`, add flag parsing alongside existing `--port` and `--allowed-origins`:

```typescript
if (arg === '--tailscale') {
  flags.tailscale = true
}
```

Add `tailscale?: boolean` to the flags interface.

- [ ] **Step 2: Add Tailscale preflight and serve lifecycle to web-mode.ts**

In `src/web-mode.ts`, after the auth token generation and before the process spawn, add:

```typescript
import {
  isTailscaleInstalled,
  getTailscaleStatus,
  startTailscaleServe,
  stopTailscaleServe,
} from "./web/tailscale.ts";
import { getOrCreateSessionSecret } from "./web/web-session-auth.ts";
```

Before spawning the server, when `--tailscale` is enabled:

```typescript
if (options.tailscale) {
  // Preflight: check Tailscale is installed and connected
  const installed = await isTailscaleInstalled();
  if (!installed) {
    console.error("Error: Tailscale CLI not found. Install it first:");
    console.error(`  ${process.platform === "darwin" ? "brew install tailscale" : "curl -fsSL https://tailscale.com/install.sh | sh"}`);
    process.exit(1);
  }

  const tsStatus = await getTailscaleStatus();
  if (!tsStatus) {
    console.error("Error: Tailscale is not connected. Run: tailscale up");
    process.exit(1);
  }

  // Preflight: require password
  const passwordHash = process.env.GSD_WEB_PASSWORD_HASH; // loaded from settings
  if (!passwordHash) {
    console.error("Error: Password required for remote access. Set it via: gsd --settings");
    process.exit(1);
  }

  // Load session secret for cookie auth
  const sessionSecret = await getOrCreateSessionSecret();

  // Add to env
  env.GSD_WEB_SESSION_SECRET = sessionSecret;
  env.GSD_WEB_PASSWORD_HASH = passwordHash;
  env.GSD_WEB_DAEMON_MODE = "1";

  // Add Tailscale origin to allowed origins
  const tsOrigin = tsStatus.url;
  const existingOrigins = env.GSD_WEB_ALLOWED_ORIGINS ?? "";
  env.GSD_WEB_ALLOWED_ORIGINS = existingOrigins
    ? `${existingOrigins},${tsOrigin}`
    : tsOrigin;
}
```

After the server is ready and before opening the browser:

```typescript
if (options.tailscale) {
  const tsStatus = await getTailscaleStatus();
  if (tsStatus) {
    await startTailscaleServe(port);
    console.log(`\nAccessible over Tailscale at: ${tsStatus.url}`);

    // Register cleanup on process exit
    const cleanup = () => {
      stopTailscaleServe().catch(() => {});
    };
    process.on("SIGTERM", cleanup);
    process.on("SIGINT", cleanup);
    process.on("exit", cleanup);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cli-web-branch.ts src/web-mode.ts
git commit -m "feat(web): add --tailscale flag with serve lifecycle and preflight checks"
```

---

## Task 10: Settings Integration for Password & Tailscale

**Files:**
- Modify: `src/web/settings-service.ts` (or wherever GSD stores persistent settings)

This task adds the `web.passwordHash` and `web.tailscale` settings, and loads them into environment variables at server startup.

- [ ] **Step 1: Identify the settings storage location**

Read `src/web/settings-service.ts` and the preferences API route to understand where persistent settings are stored and how they're loaded.

- [ ] **Step 2: Add password and tailscale settings**

Extend the settings schema and storage to include:

```typescript
interface WebRemoteAccessSettings {
  passwordHash?: string;
  tailscale?: boolean;
}
```

Add a `getRemoteAccessSettings()` function that reads these from the settings file, and a `setPassword(plaintext: string)` function that hashes and stores.

- [ ] **Step 3: Load settings into env at server startup**

In `src/web-mode.ts`, before spawning the server process, load the remote access settings and inject `GSD_WEB_PASSWORD_HASH` and `GSD_WEB_SESSION_SECRET` into the environment when a password is configured (even without `--tailscale`, so the login page works for local HTTPS setups too).

- [ ] **Step 4: Commit**

```bash
git add src/web/settings-service.ts src/web-mode.ts
git commit -m "feat(web): integrate password and tailscale settings into launch flow"
```

---

## Task 11: Event Log Initialization in Bridge Service

**Files:**
- Modify: `src/web/bridge-service.ts`
- Modify: `src/web-mode.ts` (or wherever bridge services are created)

- [ ] **Step 1: Find where BridgeService instances are created**

Grep for `new BridgeService` or `getProjectBridgeServiceForCwd` to find the factory/creation site.

- [ ] **Step 2: Initialize event log when creating bridge services**

At the creation site, compute the event log directory and call `bridge.initEventLog(dir)`:

```typescript
import { join } from "node:path";
import { appRoot } from "../app-paths.ts";
import { createHash } from "node:crypto";

// Compute project-specific event log dir
const projectHash = createHash("sha256").update(projectCwd).digest("hex").slice(0, 12);
const eventLogDir = join(appRoot, "web-events", projectHash);
bridge.initEventLog(eventLogDir);
```

- [ ] **Step 3: Add periodic log rotation**

Set up a timer that calls `eventLog.rotateIfNeeded()` every hour:

```typescript
setInterval(() => {
  bridge.getEventLog()?.rotateIfNeeded().catch(() => {});
}, 60 * 60 * 1000);
```

- [ ] **Step 4: Commit**

```bash
git add src/web/bridge-service.ts
git commit -m "feat(web): initialize event log per project and add hourly rotation"
```

---

## Task 12: Integration Testing

**Files:**
- Manual testing steps

- [ ] **Step 1: Test localhost flow unchanged**

Run `gsd --web` without `--tailscale`. Verify:
- Token-in-URL flow works as before
- No login page appears
- SSE stream works

- [ ] **Step 2: Test password auth over localhost**

Set a password via settings. Access the web UI. Verify:
- If accessed over HTTPS: login page appears, password works, cookie set, 30-day persistence
- If accessed over HTTP (localhost): existing token flow used, no login page

- [ ] **Step 3: Test Tailscale integration**

Run `gsd --web --tailscale`. Verify:
- Preflight checks pass (Tailscale installed, connected, password set)
- `tailscale serve` starts
- Access via `https://<hostname>.ts.net` shows login page
- Login works, cookie persists across browser restart
- Server stays running after browser close (daemon mode)
- `gsd web stop` cleans up `tailscale serve`

- [ ] **Step 4: Test event replay**

1. Start a session with `gsd --web --tailscale`
2. Send a message to the agent
3. Close the browser tab
4. Wait for the agent to produce output
5. Reopen the URL
6. Verify: login cookie still valid (no re-login), missed messages appear with "Catching up..." indicator

- [ ] **Step 5: Commit any fixes from integration testing**

```bash
git add -A
git commit -m "fix(web): integration test fixes for remote access"
```

---

Plan complete and saved to `docs/superpowers/plans/2026-03-28-web-remote-access.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?