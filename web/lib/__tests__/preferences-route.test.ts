import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Use a temporary GSD_HOME so the preferences route reads from a known path.
// MUST be set BEFORE importing the route module (webPreferencesPath is module-scope).
const tmpHome = mkdtempSync(join(tmpdir(), "gsd-prefs-test-"));
process.env.GSD_HOME = tmpHome;

const { GET } = await import("../../app/api/preferences/route.ts");

function writePrefs(prefs: Record<string, unknown>) {
  mkdirSync(tmpHome, { recursive: true });
  writeFileSync(join(tmpHome, "web-preferences.json"), JSON.stringify(prefs), "utf-8");
}

function writeRawPrefs(raw: string) {
  mkdirSync(tmpHome, { recursive: true });
  writeFileSync(join(tmpHome, "web-preferences.json"), raw, "utf-8");
}

function withLaunchCwd<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.GSD_WEB_PROJECT_CWD;
  if (value === undefined) delete process.env.GSD_WEB_PROJECT_CWD;
  else process.env.GSD_WEB_PROJECT_CWD = value;
  return fn().finally(() => {
    if (prev === undefined) delete process.env.GSD_WEB_PROJECT_CWD;
    else process.env.GSD_WEB_PROJECT_CWD = prev;
  });
}

describe("GET /api/preferences — launchCwd propagation", () => {
  before(() => {
    writePrefs({ devRoot: "/Users/alice/dev", lastActiveProject: "/Users/alice/dev/foo" });
  });

  after(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    delete process.env.GSD_HOME;
  });

  test("includes launchCwd from GSD_WEB_PROJECT_CWD when set", async () => {
    await withLaunchCwd("/Users/alice/dev/launched-project", async () => {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.launchCwd, "/Users/alice/dev/launched-project");
      assert.equal(body.devRoot, "/Users/alice/dev");
      assert.equal(body.lastActiveProject, "/Users/alice/dev/foo");
    });
  });

  test("normalizes launchCwd (trailing slash, redundant segments)", async () => {
    await withLaunchCwd("/Users/alice/dev/foo/./", async () => {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.launchCwd, resolve("/Users/alice/dev/foo"));
    });
  });

  test("launchCwd is null when GSD_WEB_PROJECT_CWD is unset", async () => {
    await withLaunchCwd(undefined, async () => {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.launchCwd, null);
    });
  });

  test("launchCwd is null when GSD_WEB_PROJECT_CWD is empty string", async () => {
    await withLaunchCwd("", async () => {
      const res = await GET();
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.launchCwd, null);
    });
  });

  test("still returns launchCwd when preferences file is corrupt", async () => {
    writeRawPrefs("{not valid json");
    try {
      await withLaunchCwd("/Users/alice/dev/recovered", async () => {
        const res = await GET();
        const body = (await res.json()) as Record<string, unknown>;
        assert.equal(body.launchCwd, "/Users/alice/dev/recovered");
        assert.equal(body.devRoot, undefined);
      });
    } finally {
      // Restore valid prefs for any later tests in the suite.
      writePrefs({ devRoot: "/Users/alice/dev", lastActiveProject: "/Users/alice/dev/foo" });
    }
  });
});
