/**
 * graph-slash-command-5148.test.ts
 *
 * Regression test for issue #5148: `/gsd graph build|status|query|diff`
 * was not registered in the interactive command dispatcher even though
 * the CLI subcommand existed.
 *
 * Verifies that the slash dispatcher:
 *   1. Does not emit the "Unknown: /gsd graph …" fallback warning.
 *   2. Routes each subcommand to a real handler producing the expected
 *      user-facing output (mirroring `gsd graph` in src/cli.ts).
 *   3. Surfaces argument-validation messages (e.g. missing query term).
 *
 * Also covers catalog wiring used by completions/help so the command is
 * discoverable in the same way as its peers (e.g. `knowledge`).
 */

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleGSDCommand } from "../commands/dispatcher.ts";
import {
  GSD_COMMAND_DESCRIPTION,
  TOP_LEVEL_SUBCOMMANDS,
  getGsdArgumentCompletions,
} from "../commands/catalog.ts";

interface Notification {
  message: string;
  level: string;
}

function createMockCtx() {
  const notifications: Notification[] = [];
  return {
    notifications,
    ctx: {
      notifications,
      ui: {
        notify(message: string, level: string) {
          notifications.push({ message, level });
        },
        custom: async () => {},
      },
      shutdown: async () => {},
    },
  };
}

function lastMessage(notifications: Notification[]): Notification {
  assert.ok(notifications.length > 0, "expected at least one notification");
  return notifications[notifications.length - 1];
}

describe("/gsd graph — issue #5148: wired into slash dispatcher", () => {
  let base: string;
  let saved: string;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), "gsd-graph-5148-")));
    mkdirSync(join(base, ".gsd"), { recursive: true });
    saved = process.cwd();
    process.chdir(base);
  });

  afterEach(() => {
    process.chdir(saved);
    rmSync(base, { recursive: true, force: true });
  });

  test("/gsd graph status (no graph yet) reports the not-built message", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph status", ctx as any, {} as any);

    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.match(last.message, /not built yet/);
    assert.match(last.message, /gsd graph build/);
  });

  test("/gsd graph build creates .gsd/graph.json and reports counts", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph build", ctx as any, {} as any);

    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.match(last.message, /Graph built: \d+ nodes, \d+ edges/);
    assert.ok(
      existsSync(join(base, ".gsd", "graphs", "graph.json")),
      "graph.json must be written under .gsd/graphs/",
    );
  });

  test("/gsd graph status after build reports exists=true with counts", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph build", ctx as any, {} as any);
    notifications.length = 0;

    await handleGSDCommand("graph status", ctx as any, {} as any);
    const last = lastMessage(notifications);
    assert.match(last.message, /exists:\s+true/);
    assert.match(last.message, /nodes:\s+\d+/);
    assert.match(last.message, /edges:\s+\d+/);
  });

  test("/gsd graph query (no term) emits a usage warning", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph query", ctx as any, {} as any);

    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.equal(last.level, "warning");
    assert.match(last.message, /Usage: \/gsd graph query <term>/);
  });

  test("/gsd graph query <term> after build returns a result block", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph build", ctx as any, {} as any);
    notifications.length = 0;

    await handleGSDCommand("graph query nonexistent-term-xyz", ctx as any, {} as any);
    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.match(last.message, /No nodes found|Query results/);
  });

  test("/gsd graph diff after build reports a structured diff summary", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph build", ctx as any, {} as any);
    notifications.length = 0;

    await handleGSDCommand("graph diff", ctx as any, {} as any);
    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.match(last.message, /nodes added:\s+\d+/);
    assert.match(last.message, /edges added:\s+\d+/);
  });

  test("/gsd graph (no subcommand) defaults to build, mirroring src/cli.ts", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph", ctx as any, {} as any);

    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph/);
    assert.match(last.message, /Graph built: \d+ nodes, \d+ edges/);
  });

  test("/gsd graph <unknown> reports a friendly usage error, not the fallback warning", async () => {
    const { notifications, ctx } = createMockCtx();
    await handleGSDCommand("graph banana", ctx as any, {} as any);

    const last = lastMessage(notifications);
    assert.doesNotMatch(last.message, /Unknown: \/gsd graph banana/);
    assert.equal(last.level, "warning");
    assert.match(last.message, /Unknown graph command/);
    for (const sub of ["build", "status", "query", "diff"]) {
      assert.match(last.message, new RegExp(sub), `usage hint should mention ${sub}`);
    }
  });
});

describe("/gsd graph — catalog & completion wiring", () => {
  test("graph appears in TOP_LEVEL_SUBCOMMANDS", () => {
    const entry = TOP_LEVEL_SUBCOMMANDS.find((c) => c.cmd === "graph");
    assert.ok(entry, "graph must be present in TOP_LEVEL_SUBCOMMANDS");
    assert.ok(entry!.desc.length > 0, "graph entry needs a description");
  });

  test("GSD_COMMAND_DESCRIPTION includes the graph token", () => {
    assert.ok(
      GSD_COMMAND_DESCRIPTION.includes("|graph"),
      "GSD_COMMAND_DESCRIPTION must list `graph` so /gsd autocompletion surfaces it",
    );
  });

  test("getGsdArgumentCompletions exposes graph subcommands", () => {
    const completions = getGsdArgumentCompletions("graph ");
    const labels = completions.map((c) => c.label);
    assert.deepStrictEqual(
      [...labels].sort(),
      ["build", "diff", "query", "status"],
      `expected build|status|query|diff completions, got: ${labels.join(", ")}`,
    );
  });
});
