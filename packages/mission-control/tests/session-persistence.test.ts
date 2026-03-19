import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { rmSync, mkdirSync } from "node:fs";
// This import will fail until session-persistence-api.ts is created (RED phase)
// @ts-ignore — module does not exist yet
import { readSession, writeSession } from "../src/server/session-persistence-api";

// Unique test directory to avoid collision with real session file
const TEST_DIR = join(import.meta.dir, "__session-persistence-test-" + process.pid);

beforeEach(() => {
  mkdirSync(join(TEST_DIR, ".planning"), { recursive: true });
});

afterEach(() => {
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // best effort cleanup
  }
});

describe("readSession", () => {
  test("returns default values when file does not exist", async () => {
    const session = await readSession(join(TEST_DIR, ".planning"));
    expect(session).toBeDefined();
    expect(session.version).toBe(1);
    expect(session.layoutPrefs).toBeDefined();
    expect(session.chatHistory).toBeDefined();
    expect(session.lastView).toBe("chat");
    expect(session.activeViewport).toBeDefined();
  });
});

describe("writeSession", () => {
  test("caps chatHistory to 50 messages per sessionId", () => {
    const messages = Array.from({ length: 70 }, (_, i) => ({
      id: `msg-${i}`,
      role: "user" as const,
      content: `Message ${i}`,
      timestamp: Date.now() + i,
    }));

    writeSession(join(TEST_DIR, ".planning"), {
      version: 1,
      layoutPrefs: {},
      chatHistory: { "session-1": messages },
      lastView: "chat",
      activeViewport: "desktop",
    });

    // Read back and verify cap
    const readBack = readSession(join(TEST_DIR, ".planning"));
    // readSession returns a Promise in async version, handle both
    const checkResult = (session: any) => {
      expect(session.chatHistory["session-1"].length).toBe(50);
      // Should keep the LAST 50 (slice(-50))
      expect(session.chatHistory["session-1"][0].id).toBe("msg-20");
      expect(session.chatHistory["session-1"][49].id).toBe("msg-69");
    };

    if (readBack instanceof Promise) {
      return readBack.then(checkResult);
    } else {
      checkResult(readBack);
    }
  });

  test("persists layoutPrefs and activeViewport", () => {
    const data = {
      version: 1 as const,
      layoutPrefs: { "main-panel": 640, "sidebar": 320 },
      chatHistory: {},
      lastView: "chat" as const,
      activeViewport: "tablet" as const,
    };

    writeSession(join(TEST_DIR, ".planning"), data);

    const readBack = readSession(join(TEST_DIR, ".planning"));
    const checkResult = (session: any) => {
      expect(session.layoutPrefs["main-panel"]).toBe(640);
      expect(session.layoutPrefs["sidebar"]).toBe(320);
      expect(session.activeViewport).toBe("tablet");
    };

    if (readBack instanceof Promise) {
      return readBack.then(checkResult);
    } else {
      checkResult(readBack);
    }
  });
});

describe("round-trip", () => {
  test("write then read returns same data", async () => {
    const data = {
      version: 1 as const,
      layoutPrefs: { "panel-group": 800 },
      chatHistory: {
        "session-abc": [
          { id: "m1", role: "user" as const, content: "Hello", timestamp: 1000 },
          { id: "m2", role: "assistant" as const, content: "World", timestamp: 2000 },
        ],
      },
      lastView: "chat" as const,
      activeViewport: "mobile" as const,
    };

    writeSession(join(TEST_DIR, ".planning"), data);
    const result = await readSession(join(TEST_DIR, ".planning"));

    expect(result.version).toBe(1);
    expect(result.layoutPrefs["panel-group"]).toBe(800);
    expect(result.chatHistory["session-abc"]).toHaveLength(2);
    expect(result.chatHistory["session-abc"][0].content).toBe("Hello");
    expect(result.activeViewport).toBe("mobile");
    expect(result.lastView).toBe("chat");
  });
});
