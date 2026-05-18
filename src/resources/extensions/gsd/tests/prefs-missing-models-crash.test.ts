/**
 * Regression coverage for the `/gsd setup prefs` crash:
 *   "Cannot read properties of undefined (reading 'models')"
 *
 * Originally caused by unsafe `prefs?.preferences.models` access (optional-
 * chained on `prefs` only, not on `preferences`) plus a wizard entrypoint
 * that did not normalize partially-formed preference shapes. These tests
 * pin the new behavior so future refactors cannot silently re-introduce the
 * crash.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { normalizePreferencesShape } from "../preferences.ts";
import {
  resolveDefaultSessionModel,
  resolveModelWithFallbacksForUnit,
} from "../preferences-models.ts";
import { buildCategorySummaries, handlePrefsWizard } from "../commands-prefs-wizard.ts";
import { readModelFromPreferences } from "../watch/header-renderer.ts";

// ─── normalizePreferencesShape ─────────────────────────────────────────────

test("normalizePreferencesShape: null/undefined/non-object → empty object", () => {
  assert.deepEqual(normalizePreferencesShape(null), {});
  assert.deepEqual(normalizePreferencesShape(undefined), {});
  assert.deepEqual(normalizePreferencesShape("nope"), {});
  assert.deepEqual(normalizePreferencesShape(42), {});
});

test("normalizePreferencesShape: wrapper with preferences=undefined → empty object", () => {
  assert.deepEqual(
    normalizePreferencesShape({ path: "/x", scope: "global", preferences: undefined }),
    {},
  );
});

test("normalizePreferencesShape: full wrapper unwraps to a fresh bare prefs object", () => {
  const wrapper = {
    path: "/x",
    scope: "global" as const,
    preferences: { mode: "team" as string, models: { execution: "p/m" } },
  };
  const out = normalizePreferencesShape(wrapper);
  assert.deepEqual(out, { mode: "team", models: { execution: "p/m" } });
  // Mutating the result must not bleed into the wrapper.
  out.mode = "solo";
  assert.equal(wrapper.preferences.mode, "team");
});

test("normalizePreferencesShape: bare prefs object pass-through (no `preferences` key)", () => {
  const bare = { mode: "solo" as string, models: { planning: "p/m" } };
  const out = normalizePreferencesShape(bare);
  assert.deepEqual(out, bare);
  out.mode = "team";
  assert.equal(bare.mode, "solo");
});

// ─── buildCategorySummaries on missing models ──────────────────────────────

test("buildCategorySummaries({}) reports models as not configured without throwing", () => {
  const summaries = buildCategorySummaries({});
  assert.equal(summaries.models, "(not configured)");
});

// ─── Model resolvers tolerate missing/partial preference shapes ────────────

function withGsdHome(content: string | null, fn: () => void): void {
  const oldHome = process.env.GSD_HOME;
  const home = mkdtempSync(join(tmpdir(), "gsd-prefs-missing-"));
  try {
    process.env.GSD_HOME = home;
    if (content !== null) {
      writeFileSync(join(home, "PREFERENCES.md"), content);
    }
    fn();
  } finally {
    if (oldHome === undefined) delete process.env.GSD_HOME;
    else process.env.GSD_HOME = oldHome;
    rmSync(home, { recursive: true, force: true });
  }
}

test("resolveModelWithFallbacksForUnit returns undefined when no preferences file exists", () => {
  withGsdHome(null, () => {
    assert.equal(resolveModelWithFallbacksForUnit("execute-task"), undefined);
  });
});

test("resolveModelWithFallbacksForUnit returns undefined when preferences omit models", () => {
  withGsdHome("---\nmode: solo\n---\n", () => {
    assert.equal(resolveModelWithFallbacksForUnit("execute-task"), undefined);
  });
});

test("resolveDefaultSessionModel returns undefined when no preferences file exists", () => {
  withGsdHome(null, () => {
    assert.equal(resolveDefaultSessionModel("anthropic"), undefined);
  });
});

test("resolveDefaultSessionModel returns undefined when preferences omit models", () => {
  withGsdHome("---\nmode: solo\n---\n", () => {
    assert.equal(resolveDefaultSessionModel("anthropic"), undefined);
  });
});

test("readModelFromPreferences returns 'default' when preferences omit models", () => {
  withGsdHome("---\nmode: solo\n---\n", () => {
    assert.equal(readModelFromPreferences(), "default");
  });
});

// ─── End-to-end wizard: no existing prefs + immediate Save & Exit ──────────

test("handlePrefsWizard works with no existing preferences and Save & Exit", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-prefs-wizard-empty-"));
  const prefsPath = join(dir, "PREFERENCES.md");
  try {
    let saveExitReturned = false;
    const ctx = {
      ui: {
        notify() {},
        select: async () => {
          saveExitReturned = true;
          return "── Save & Exit ──";
        },
      },
      waitForIdle: async () => {},
      reload: async () => {},
    } as any;

    await handlePrefsWizard(ctx, "project", undefined, { pathOverride: prefsPath });
    assert.ok(saveExitReturned, "wizard should have prompted for category selection");

    const saved = readFileSync(prefsPath, "utf-8");
    assert.match(saved, /^---\n/, "saved file must start with frontmatter");
    assert.match(saved, /version:\s*1/, "saved file must default version to 1");
    // No bogus empty models block when no models were configured.
    assert.doesNotMatch(saved, /^models:\s*$/m, "must not write empty models block");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
