/**
 * Chat message and panel component tests (Phase 06-02 Task 2).
 *
 * Pattern: Direct function call on components + JSON.stringify inspection,
 * matching the approach used in slice-detail.test.tsx and active-task.test.tsx.
 */
import { describe, expect, it } from "bun:test";
import { ChatMessage } from "../src/components/chat/ChatMessage";
import { ChatPanelView } from "../src/components/chat/ChatPanel";
import type { ChatMessage as ChatMessageType } from "../src/server/chat-types";

function makeMessage(overrides: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: "msg-1",
    role: "user",
    content: "Hello world",
    timestamp: Date.now(),
    streaming: false,
    ...overrides,
  };
}

// -- ChatMessage role-based styling --

describe("ChatMessage", () => {
  it("renders assistant with cyan border and navy-800 bg", () => {
    const msg = makeMessage({ role: "assistant", content: "I can help" });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-navy-800");
    expect(json).toContain("border-cyan-accent");
    expect(json).toContain("border-l-2");
    expect(json).toContain("I can help");
  });

  it("renders system with italic text and slate-500 color", () => {
    const msg = makeMessage({ role: "system", content: "System notice" });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-navy-900");
    expect(json).toContain("text-slate-500");
    expect(json).toContain("italic");
    expect(json).toContain("text-xs");
    expect(json).toContain("System notice");
  });

  it("renders user with navy-base background", () => {
    const msg = makeMessage({ role: "user", content: "My message" });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("bg-navy-base");
    expect(json).toContain("My message");
  });

  it("shows pulsing cursor when streaming", () => {
    const msg = makeMessage({ role: "assistant", streaming: true, content: "partial..." });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("animate-pulse");
  });

  it("does not show cursor when not streaming", () => {
    const msg = makeMessage({ role: "assistant", streaming: false });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).not.toContain("animate-pulse");
  });

  it("shows tool usage indicator in amber when toolName set", () => {
    const msg = makeMessage({
      role: "assistant",
      toolName: "Bash",
      toolDone: false,
      content: "",
    });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("text-amber");
    expect(json).toContain("Bash");
  });

  it("shows done suffix when tool is complete", () => {
    const msg = makeMessage({
      role: "assistant",
      toolName: "Edit",
      toolDone: true,
      content: "",
    });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("Edit");
    expect(json).toContain("done");
  });

  it("renders content in whitespace-pre-wrap span", () => {
    const msg = makeMessage({ content: "line1\nline2" });
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("whitespace-pre-wrap");
  });

  it("applies px-4 py-3 text-sm font-mono styling", () => {
    const msg = makeMessage({});
    const result = ChatMessage({ message: msg });
    const json = JSON.stringify(result);
    expect(json).toContain("px-4");
    expect(json).toContain("py-3");
    expect(json).toContain("text-sm");
    expect(json).toContain("font-mono");
  });
});

// -- ChatPanelView (pure render, no hooks) --

describe("ChatPanelView", () => {
  it("renders messages list", () => {
    const messages = [
      makeMessage({ id: "1", role: "user", content: "Hello" }),
      makeMessage({ id: "2", role: "assistant", content: "Hi there" }),
    ];
    const result = ChatPanelView({
      messages,
      onSend: () => {},
      isProcessing: false,
      scrollRef: { current: null },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("Hello");
    expect(json).toContain("Hi there");
  });

  it("shows empty state when no messages", () => {
    const result = ChatPanelView({
      messages: [],
      onSend: () => {},
      isProcessing: false,
      scrollRef: { current: null },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("/gsd:");
    expect(json).toContain("text-slate-500");
  });

  it("passes isProcessing to ChatInput as disabled", () => {
    const result = ChatPanelView({
      messages: [],
      onSend: () => {},
      isProcessing: true,
      scrollRef: { current: null },
    });
    const json = JSON.stringify(result);
    // ChatInput is rendered as a component ref; check disabled prop is passed
    expect(json).toContain("\"disabled\":true");
  });

  it("renders flex col h-full layout", () => {
    const result = ChatPanelView({
      messages: [],
      onSend: () => {},
      isProcessing: false,
      scrollRef: { current: null },
    });
    const json = JSON.stringify(result);
    expect(json).toContain("flex");
    expect(json).toContain("flex-col");
    expect(json).toContain("h-full");
  });
});
