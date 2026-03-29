/**
 * Google Search Extension — deprecation stub tests.
 *
 * After extraction to @gsd-extensions/google-search, the bundled extension
 * is replaced with a deprecation stub that notifies users to install the
 * standalone package. These tests verify the stub behavior.
 */

import test from "node:test";
import assert from "node:assert/strict";
import googleSearchExtension from "../resources/extensions/google-search/index.ts";

function createMockPI() {
  const handlers: any[] = [];
  let registeredTool: any = null;

  return {
    handlers,
    registeredTool,
    on(event: string, handler: any) {
      handlers.push({ event, handler });
    },
    registerTool(tool: any) {
      this.registeredTool = tool;
    },
    async fire(event: string, eventData: any, ctx: any) {
      for (const h of handlers) {
        if (h.event === event) {
          await h.handler(eventData, ctx);
        }
      }
    }
  };
}

test("google-search stub registers session_start handler", () => {
  const pi = createMockPI();
  googleSearchExtension(pi as any);
  assert.ok(
    pi.handlers.some(h => h.event === "session_start"),
    "stub should register a session_start handler",
  );
});

test("google-search stub does NOT register a tool", () => {
  const pi = createMockPI();
  googleSearchExtension(pi as any);
  assert.equal(pi.registeredTool, null, "stub should not register any tools");
});

test("google-search stub shows deprecation warning on session_start", async () => {
  const pi = createMockPI();
  googleSearchExtension(pi as any);

  const notifications: Array<{ msg: string; level: string }> = [];
  const mockCtx = {
    ui: {
      notify(msg: string, level: string) {
        notifications.push({ msg, level });
      },
    },
  };

  await pi.fire("session_start", {}, mockCtx);

  assert.equal(notifications.length, 1, "should emit exactly one notification");
  assert.equal(notifications[0].level, "warning", "should be a warning");
  assert.ok(
    notifications[0].msg.includes("@gsd-extensions/google-search"),
    "should mention the standalone package name",
  );
  assert.ok(
    notifications[0].msg.includes("install"),
    "should suggest installing the standalone package",
  );
});
