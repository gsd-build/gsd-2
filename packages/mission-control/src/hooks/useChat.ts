/**
 * React hook for chat state and WebSocket communication.
 *
 * Manages its own WebSocket connection (separate from usePlanningState).
 * Sends chat messages and processes chat_event/chat_complete/chat_error responses.
 * Handles permission_prompt and project_switched events.
 * Ignores "full" and "diff" messages intended for usePlanningState.
 */
import { useState, useCallback, useRef } from "react";
import { useReconnectingWebSocket } from "./useReconnectingWebSocket";
import { setCustomCommands } from "../lib/slash-commands";
import type { ChatMessage, ChatResponse, StreamEvent, PermissionPromptEvent } from "../server/chat-types";
import type { SlashCommand } from "../lib/slash-commands";

export interface UseChatOptions {
  /** Callback fired for each stream event, used to feed useActivity. */
  onActivityEvent?: (event: StreamEvent) => void;
}

export interface UseChatResult {
  messages: ChatMessage[];
  sendMessage: (text: string) => void;
  isProcessing: boolean;
  permissionPrompt: PermissionPromptEvent | null;
  respondToPermission: (action: "approve" | "always_allow" | "deny") => void;
  clearMessages: () => void;
}

/** Generate a simple unique ID for chat messages. */
function createMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Process a stream event and return updated content and tool metadata.
 * Handles content_block_start (tool_use) and content_block_delta (text_delta).
 */
export function processStreamEvent(
  event: StreamEvent,
  currentContent: string,
): { content: string; toolName?: string; toolDone?: boolean } {
  if (!event.event) {
    // Result or system messages may carry text in result field
    if (event.type === "result" && event.result) {
      return { content: currentContent + event.result };
    }
    if (event.type === "system" && event.result) {
      return { content: event.result };
    }
    return { content: currentContent };
  }

  const { type, delta, content_block } = event.event;

  // Tool use start indicator
  if (type === "content_block_start" && content_block?.type === "tool_use") {
    return { content: currentContent, toolName: content_block.name };
  }

  // Tool use completion
  if (type === "content_block_stop") {
    return { content: currentContent, toolDone: true };
  }

  // Text streaming delta
  if (type === "content_block_delta" && delta?.type === "text_delta" && delta.text) {
    return { content: currentContent + delta.text };
  }

  return { content: currentContent };
}

/**
 * Hook for managing chat state with WebSocket communication.
 * Creates its own WebSocket connection to avoid coupling with usePlanningState.
 *
 * @deprecated Use `useSessionManager` instead for multi-session support.
 * This hook is kept for backward compatibility.
 */
export function useChat(
  wsUrl: string = "ws://localhost:4001",
  options: UseChatOptions = {},
): UseChatResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [permissionPrompt, setPermissionPrompt] = useState<PermissionPromptEvent | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const onActivityEventRef = useRef(options.onActivityEvent);
  onActivityEventRef.current = options.onActivityEvent;

  const handleMessage = useCallback((data: unknown) => {
    const msg = data as ChatResponse;

    // Ignore planning state messages (full/diff)
    if (!msg || typeof msg !== "object") return;
    const msgType = (msg as { type?: string }).type;
    if (msgType === "full" || msgType === "diff") return;

    // Handle custom commands discovery from server
    if (msgType === "custom_commands") {
      const commands = (msg as { commands?: SlashCommand[] }).commands;
      if (commands && Array.isArray(commands)) {
        setCustomCommands(commands);
      }
      return;
    }

    // Handle permission prompt events
    if (msgType === "permission_prompt") {
      const promptData = msg as unknown as PermissionPromptEvent;
      setPermissionPrompt({
        type: "permission_prompt",
        toolName: promptData.toolName,
        toolInput: promptData.toolInput,
        promptId: promptData.promptId,
      });
      return;
    }

    // Handle project switched events — clear all client state
    if (msgType === "project_switched") {
      setMessages([]);
      setIsProcessing(false);
      return;
    }

    if (msgType === "chat_event" && msg.event) {
      const evt = msg.event!;

      // Feed stream events to activity hook
      onActivityEventRef.current?.(evt);

      // Skip noise events that don't produce visible content
      if (evt.type === "system" && !evt.result) return;
      if (evt.type === "rate_limit_event") return;
      // Skip stream_event wrappers that don't carry text or tool info
      if (evt.type === "stream_event" && evt.event) {
        const inner = evt.event;
        if (inner.type === "message_start" || inner.type === "message_delta" || inner.type === "message_stop") return;
      }
      // Skip partial assistant snapshots (we build from deltas)
      if (evt.type === "assistant") return;

      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.role === "assistant" && last.streaming) {
          // Accumulate into existing streaming message
          const result = processStreamEvent(evt, last.content);
          const updated: ChatMessage = {
            ...last,
            content: result.content,
            toolName: result.toolName ?? last.toolName,
            toolDone: result.toolDone ?? last.toolDone,
          };
          return [...prev.slice(0, -1), updated];
        }
        // Create new assistant message
        const result = processStreamEvent(evt, "");
        const newMsg: ChatMessage = {
          id: createMessageId(),
          role: evt.type === "system" ? "system" : "assistant",
          content: result.content,
          timestamp: Date.now(),
          streaming: true,
          toolName: result.toolName,
          toolDone: result.toolDone,
        };
        return [...prev, newMsg];
      });
      return;
    }

    if (msgType === "chat_complete") {
      if (msg.sessionId) {
        sessionIdRef.current = msg.sessionId;
      }
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.streaming) {
          return [...prev.slice(0, -1), { ...last, streaming: false }];
        }
        return prev;
      });
      setIsProcessing(false);
      return;
    }

    if (msgType === "chat_error") {
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: "system",
          content: msg.error ?? "Unknown error occurred",
          timestamp: Date.now(),
          streaming: false,
        },
      ]);
      setIsProcessing(false);
      return;
    }
  }, []);

  const { send } = useReconnectingWebSocket(wsUrl, {
    onMessage: handleMessage,
  });

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Add user message to state
      const userMsg: ChatMessage = {
        id: createMessageId(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
        streaming: false,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsProcessing(true);

      // Send over WebSocket
      send(JSON.stringify({ type: "chat", prompt: trimmed }));
    },
    [send],
  );

  const respondToPermission = useCallback(
    (action: "approve" | "always_allow" | "deny") => {
      if (!permissionPrompt) return;
      send(
        JSON.stringify({
          type: "permission_response",
          promptId: permissionPrompt.promptId,
          action,
        }),
      );
      setPermissionPrompt(null);
    },
    [send, permissionPrompt],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    sendMessage,
    isProcessing,
    permissionPrompt,
    respondToPermission,
    clearMessages,
  };
}
