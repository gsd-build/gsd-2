// Project/App: GSD-2
// File Purpose: Verifies web UI request fixtures conform to shared RPC contracts.

import test from "node:test"
import assert from "node:assert/strict"
import type { ExtensionUiRequestEvent, PendingUiRequest } from "../gsd-workspace-store.tsx"

test("web pending UI request accepts canonical secure input payloads", () => {
  const request = {
    type: "extension_ui_request",
    id: "secure-input-1",
    method: "input",
    title: "API key",
    placeholder: "Enter key",
    secure: true,
  } satisfies ExtensionUiRequestEvent

  const pending = request satisfies PendingUiRequest

  assert.equal(pending.method, "input")
  assert.equal(pending.secure, true)
})
