// GSD-2 — ADR-005 Phase 2: Verify browser tool compatibility declarations.
//
// Locks in the declarations that always-image-producing browser tools
// (browser_screenshot, browser_zoom_region) carry `producesImages: true` so
// the model-router filters them out on providers without imageToolResults
// (OpenAI completions/responses, Azure, Mistral, Ollama). Conditional-image
// browser tools (navigation, forms, refs, intent, interaction) must NOT
// declare producesImages — they only attach error screenshots and filtering
// them would lose the whole tool surface for OpenAI users.

import test from "node:test";
import assert from "node:assert/strict";

import type { ExtensionAPI } from "@gsd/pi-coding-agent";

import { registerScreenshotTools } from "../../browser-tools/tools/screenshot.ts";
import { registerZoomTools } from "../../browser-tools/tools/zoom.ts";

interface CapturedToolDef {
  name: string;
  compatibility?: { producesImages?: boolean; schemaFeatures?: string[] };
}

function makeCapturingPi(): { pi: ExtensionAPI; tools: CapturedToolDef[] } {
  const tools: CapturedToolDef[] = [];
  const pi = {
    registerTool(def: CapturedToolDef): void {
      tools.push({ name: def.name, compatibility: def.compatibility });
    },
  } as unknown as ExtensionAPI;
  return { pi, tools };
}

// Browser tool registration functions accept a `deps` object. None of the
// declarations under test reach for these deps at registration time — they
// only run inside execute(), which we never invoke. A bare object satisfies
// the type signature.
const stubDeps = {} as Parameters<typeof registerScreenshotTools>[1];

test("browser_screenshot declares producesImages: true", () => {
  const { pi, tools } = makeCapturingPi();
  registerScreenshotTools(pi, stubDeps);
  const screenshot = tools.find((t) => t.name === "browser_screenshot");
  assert.ok(screenshot, "browser_screenshot should be registered");
  assert.equal(
    screenshot.compatibility?.producesImages,
    true,
    "browser_screenshot must declare producesImages so it is filtered on providers without imageToolResults",
  );
});

test("browser_zoom_region declares producesImages: true", () => {
  const { pi, tools } = makeCapturingPi();
  registerZoomTools(pi, stubDeps);
  const zoom = tools.find((t) => t.name === "browser_zoom_region");
  assert.ok(zoom, "browser_zoom_region should be registered");
  assert.equal(
    zoom.compatibility?.producesImages,
    true,
    "browser_zoom_region must declare producesImages so it is filtered on providers without imageToolResults",
  );
});
