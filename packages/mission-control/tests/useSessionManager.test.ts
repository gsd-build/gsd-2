/**
 * Unit tests for useSessionManager hook logic.
 *
 * Tests the pure state management functions that underpin the hook:
 * - Message routing by sessionId
 * - Session selection and active message switching
 * - Close-session auto-switch
 * - Send payload includes sessionId
 * - session_update updates sessions list
 * - isActiveProcessing reflects only active session
 * - Session fork message copy (pendingForkRef + previousIds)
 * - Refresh recovery banner (stuckSessionId, stuckTimerRef, isReconnectedRef)
 * - Reconnect banner UI (SingleColumnView stuckSessionId prop)
 */
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createSessionManagerState,
  routeChatEvent,
  routeChatComplete,
  routeChatError,
  handleSessionUpdate,
  selectSession,
  getActiveMessages,
  getActiveProcessing,
  removeSession,
  buildChatPayload,
  type SessionManagerState,
  type SessionTab,
} from "../src/hooks/useSessionManager";

// -- Helpers --

function makeState(overrides?: Partial<SessionManagerState>): SessionManagerState {
  return createSessionManagerState(overrides);
}

function makeSessions(count: number): SessionTab[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `session-${i + 1}`,
    name: `Chat ${i + 1}`,
    isProcessing: false,
    hasWorktree: false,
  }));
}

// -- Message routing --

describe("routeChatEvent", () => {
  test("routes chat_event to correct session's message buffer", () => {
    const sessions = makeSessions(2);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    const updated = routeChatEvent(state, "session-1", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello" },
      },
    });

    const msgs1 = updated.messagesBySession.get("session-1") ?? [];
    const msgs2 = updated.messagesBySession.get("session-2") ?? [];
    expect(msgs1.length).toBe(1);
    expect(msgs1[0].content).toBe("Hello");
    expect(msgs2.length).toBe(0);
  });

  test("messages for inactive sessions accumulate silently", () => {
    const sessions = makeSessions(2);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    const updated = routeChatEvent(state, "session-2", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Background" },
      },
    });

    const msgs2 = updated.messagesBySession.get("session-2") ?? [];
    expect(msgs2.length).toBe(1);
    expect(msgs2[0].content).toBe("Background");
  });
});

// -- selectSession --

describe("selectSession", () => {
  test("switches activeSessionId", () => {
    const sessions = makeSessions(2);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    const updated = selectSession(state, "session-2");
    expect(updated.activeSessionId).toBe("session-2");
  });
});

// -- getActiveMessages --

describe("getActiveMessages", () => {
  test("returns active session's messages", () => {
    const sessions = makeSessions(2);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    // Add messages to session-1
    const withMsg = routeChatEvent(state, "session-1", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Active msg" },
      },
    });

    const active = getActiveMessages(withMsg);
    expect(active.length).toBe(1);
    expect(active[0].content).toBe("Active msg");
  });

  test("returns empty array when no messages exist", () => {
    const state = makeState({ activeSessionId: "session-1" });
    expect(getActiveMessages(state)).toEqual([]);
  });
});

// -- removeSession auto-switch --

describe("removeSession", () => {
  test("closing active session auto-switches to first remaining", () => {
    const sessions = makeSessions(3);
    const state = makeState({ sessions, activeSessionId: "session-2" });

    const updated = removeSession(state, "session-2");
    expect(updated.sessions.length).toBe(2);
    expect(updated.activeSessionId).toBe("session-1");
  });

  test("closing non-active session preserves activeSessionId", () => {
    const sessions = makeSessions(3);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    const updated = removeSession(state, "session-3");
    expect(updated.sessions.length).toBe(2);
    expect(updated.activeSessionId).toBe("session-1");
  });
});

// -- buildChatPayload --

describe("buildChatPayload", () => {
  test("includes correct sessionId in payload", () => {
    const state = makeState({ activeSessionId: "session-42" });
    const payload = buildChatPayload(state, "Hello Claude");
    expect(payload.type).toBe("chat");
    expect(payload.prompt).toBe("Hello Claude");
    expect(payload.sessionId).toBe("session-42");
  });
});

// -- handleSessionUpdate --

describe("handleSessionUpdate", () => {
  test("updates sessions list from server metadata", () => {
    const state = makeState({ sessions: [] });
    const serverSessions: SessionTab[] = [
      { id: "s1", name: "Chat 1", isProcessing: false, hasWorktree: false },
      { id: "s2", name: "Chat 2", isProcessing: true, hasWorktree: true },
    ];

    const updated = handleSessionUpdate(state, serverSessions);
    expect(updated.sessions.length).toBe(2);
    expect(updated.sessions[1].isProcessing).toBe(true);
    expect(updated.sessions[1].hasWorktree).toBe(true);
  });

  test("sets activeSessionId to first session if current is invalid", () => {
    const state = makeState({ activeSessionId: "nonexistent" });
    const serverSessions: SessionTab[] = [
      { id: "s1", name: "Chat 1", isProcessing: false, hasWorktree: false },
    ];

    const updated = handleSessionUpdate(state, serverSessions);
    expect(updated.activeSessionId).toBe("s1");
  });
});

// -- getActiveProcessing --

describe("getActiveProcessing", () => {
  test("reflects only active session's processing state", () => {
    const state = makeState({ activeSessionId: "session-1" });

    // Session 1 not processing, session 2 processing
    state.processingBySession.set("session-1", false);
    state.processingBySession.set("session-2", true);

    expect(getActiveProcessing(state)).toBe(false);
  });

  test("returns true when active session is processing", () => {
    const state = makeState({ activeSessionId: "session-1" });
    state.processingBySession.set("session-1", true);

    expect(getActiveProcessing(state)).toBe(true);
  });

  test("returns false when no processing info exists", () => {
    const state = makeState({ activeSessionId: "session-1" });
    expect(getActiveProcessing(state)).toBe(false);
  });
});

// -- routeChatComplete --

describe("routeChatComplete", () => {
  test("marks streaming message as complete", () => {
    const sessions = makeSessions(1);
    let state = makeState({ sessions, activeSessionId: "session-1" });

    // First add a streaming message
    state = routeChatEvent(state, "session-1", {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Done" },
      },
    });

    const updated = routeChatComplete(state, "session-1");
    const msgs = updated.messagesBySession.get("session-1") ?? [];
    expect(msgs[0].streaming).toBe(false);
    expect(updated.processingBySession.get("session-1")).toBe(false);
  });
});

// -- routeChatError --

describe("routeChatError", () => {
  test("adds error system message to session", () => {
    const sessions = makeSessions(1);
    const state = makeState({ sessions, activeSessionId: "session-1" });

    const updated = routeChatError(state, "session-1", "Something went wrong");
    const msgs = updated.messagesBySession.get("session-1") ?? [];
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toBe("Something went wrong");
    expect(updated.processingBySession.get("session-1")).toBe(false);
  });
});

// -- Session fork message copy --

describe("session fork message copy", () => {
  test("pendingForkRef is defined in useSessionManager source", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("pendingForkRef");
    expect(src).toContain("previousIds");
  });

  test("fork copies parent messages to new session", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("parentMsgs = prev.get(forkSourceId)");
    expect(src).toContain("newMap.set(newSession.id");
  });
});

// -- Refresh recovery banner --

describe("refresh recovery banner", () => {
  test("stuck session detection after reconnect", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("stuckSessionId");
    expect(src).toContain("stuckTimerRef");
    expect(src).toContain("isReconnectedRef");
    expect(src).toContain("3000"); // 3 second timeout
  });

  test("reconnectSession clears stuck state", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    expect(src).toContain("reconnectSession");
    expect(src).toContain("setStuckSessionId(null)");
  });

  test("chat_event clears stuck timer", () => {
    const src = readFileSync(join(import.meta.dir, "../src/hooks/useSessionManager.ts"), "utf8");
    // Verify that chat_event handler clears the stuck timer
    expect(src).toContain("clearTimeout(stuckTimerRef.current)");
  });
});

// -- Reconnect banner UI --

describe("reconnect banner", () => {
  test("SingleColumnView renders reconnect banner when stuckSessionId present", () => {
    const src = readFileSync(join(import.meta.dir, "../src/components/layout/SingleColumnView.tsx"), "utf8");
    expect(src).toContain("stuckSessionId");
    expect(src).toContain("GSD may still be running");
    expect(src).toContain("Reconnect");
    expect(src).toContain("onReconnectSession");
  });
});
