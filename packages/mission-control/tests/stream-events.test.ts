/**
 * Tests for enhanced streaming types (Phase 6.2).
 * Verifies ChatEventType includes permission_prompt, StreamEvent has
 * parent_tool_use_id and uuid fields, and new interfaces exist.
 */
import { describe, it, expect } from "bun:test";
import type {
  ChatEventType,
  StreamEvent,
  ChatResponse,
  PermissionPromptEvent,
  PermissionResponse,
} from "../src/server/chat-types";

describe("Enhanced ChatEventType", () => {
  it("includes permission_prompt as a valid type", () => {
    const eventType: ChatEventType = "permission_prompt";
    expect(eventType).toBe("permission_prompt");
  });

  it("still supports existing types", () => {
    const types: ChatEventType[] = ["system", "assistant", "result", "stream_event", "permission_prompt"];
    expect(types).toHaveLength(5);
  });
});

describe("Enhanced StreamEvent", () => {
  it("supports parent_tool_use_id field", () => {
    const event: StreamEvent = {
      type: "stream_event",
      parent_tool_use_id: "toolu_abc123",
    };
    expect(event.parent_tool_use_id).toBe("toolu_abc123");
  });

  it("allows parent_tool_use_id to be null", () => {
    const event: StreamEvent = {
      type: "stream_event",
      parent_tool_use_id: null,
    };
    expect(event.parent_tool_use_id).toBeNull();
  });

  it("allows parent_tool_use_id to be undefined", () => {
    const event: StreamEvent = {
      type: "stream_event",
    };
    expect(event.parent_tool_use_id).toBeUndefined();
  });

  it("supports uuid field", () => {
    const event: StreamEvent = {
      type: "stream_event",
      uuid: "evt_abc123",
    };
    expect(event.uuid).toBe("evt_abc123");
  });

  it("supports content_block with id field", () => {
    const event: StreamEvent = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read", id: "toolu_xyz" },
      },
    };
    expect(event.event!.content_block!.id).toBe("toolu_xyz");
  });
});

describe("PermissionPromptEvent interface", () => {
  it("has required fields: type, toolName, toolInput, promptId", () => {
    const event: PermissionPromptEvent = {
      type: "permission_prompt",
      toolName: "Bash",
      toolInput: "rm -rf /",
      promptId: "perm_123",
    };
    expect(event.type).toBe("permission_prompt");
    expect(event.toolName).toBe("Bash");
    expect(event.toolInput).toBe("rm -rf /");
    expect(event.promptId).toBe("perm_123");
  });
});

describe("PermissionResponse interface", () => {
  it("has required fields: type, promptId, action", () => {
    const response: PermissionResponse = {
      type: "permission_response",
      promptId: "perm_123",
      action: "approve",
    };
    expect(response.type).toBe("permission_response");
    expect(response.promptId).toBe("perm_123");
    expect(response.action).toBe("approve");
  });

  it("supports always_allow action", () => {
    const response: PermissionResponse = {
      type: "permission_response",
      promptId: "perm_456",
      action: "always_allow",
    };
    expect(response.action).toBe("always_allow");
  });

  it("supports deny action", () => {
    const response: PermissionResponse = {
      type: "permission_response",
      promptId: "perm_789",
      action: "deny",
    };
    expect(response.action).toBe("deny");
  });
});

describe("Enhanced ChatResponse", () => {
  it("supports permission_prompt type", () => {
    const response: ChatResponse = {
      type: "permission_prompt",
    };
    expect(response.type).toBe("permission_prompt");
  });
});
