/**
 * Integration tests for useChat hook message handling.
 *
 * Tests the processStreamEvent pure function and message type discrimination
 * without needing React or WebSocket infrastructure.
 */
import { describe, test, expect } from "bun:test";
import { processStreamEvent } from "../src/hooks/useChat";
import type { StreamEvent, ChatResponse } from "../src/server/chat-types";

describe("processStreamEvent", () => {
  test("accumulates text from text_delta events", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "Hello " },
      },
    };
    const result = processStreamEvent(event, "");
    expect(result.content).toBe("Hello ");

    const result2 = processStreamEvent(event, "Hello ");
    expect(result2.content).toBe("Hello Hello ");
  });

  test("appends text_delta to existing content", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "world" },
      },
    };
    const result = processStreamEvent(event, "Hello ");
    expect(result.content).toBe("Hello world");
  });

  test("detects tool_use from content_block_start", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" },
      },
    };
    const result = processStreamEvent(event, "existing text");
    expect(result.toolName).toBe("Read");
    expect(result.content).toBe("existing text"); // content unchanged
  });

  test("marks tool done from content_block_stop", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: { type: "content_block_stop" },
    };
    const result = processStreamEvent(event, "text");
    expect(result.toolDone).toBe(true);
  });

  test("handles result event with result text", () => {
    const event: StreamEvent = {
      type: "result",
      result: "Final answer",
    };
    const result = processStreamEvent(event, "streaming ");
    expect(result.content).toBe("streaming Final answer");
  });

  test("handles system event with result text", () => {
    const event: StreamEvent = {
      type: "system",
      result: "GSD command: /status",
    };
    const result = processStreamEvent(event, "");
    expect(result.content).toBe("GSD command: /status");
  });

  test("returns unchanged content for unknown event types", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: { type: "unknown_event_type" },
    };
    const result = processStreamEvent(event, "existing");
    expect(result.content).toBe("existing");
    expect(result.toolName).toBeUndefined();
    expect(result.toolDone).toBeUndefined();
  });

  test("handles event with no event property", () => {
    const event: StreamEvent = { type: "assistant" };
    const result = processStreamEvent(event, "current");
    expect(result.content).toBe("current");
  });
});

describe("message type discrimination", () => {
  test("chat_event messages have event property", () => {
    const msg: ChatResponse = {
      type: "chat_event",
      event: {
        type: "stream_event",
        event: {
          type: "content_block_delta",
          delta: { type: "text_delta", text: "hi" },
        },
      },
    };
    expect(msg.type).toBe("chat_event");
    expect(msg.event).toBeDefined();
  });

  test("chat_complete messages mark end of streaming", () => {
    const msg: ChatResponse = {
      type: "chat_complete",
      sessionId: "sess-123",
    };
    expect(msg.type).toBe("chat_complete");
    expect(msg.sessionId).toBe("sess-123");
  });

  test("chat_error messages carry error string", () => {
    const msg: ChatResponse = {
      type: "chat_error",
      error: "Claude process failed",
    };
    expect(msg.type).toBe("chat_error");
    expect(msg.error).toBe("Claude process failed");
  });

  test("full messages are ignored by chat (planning state protocol)", () => {
    const msg = { type: "full", state: {}, sequence: 1, timestamp: Date.now() };
    // Chat hook should ignore this -- type is not chat_event/chat_complete/chat_error
    expect(msg.type).not.toMatch(/^chat_/);
  });

  test("diff messages are ignored by chat (planning state protocol)", () => {
    const msg = { type: "diff", changes: {}, sequence: 2 };
    expect(msg.type).not.toMatch(/^chat_/);
  });
});
