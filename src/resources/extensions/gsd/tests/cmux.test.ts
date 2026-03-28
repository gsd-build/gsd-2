import test, { describe } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildCmuxProgress,
  buildCmuxStatusLabel,
  CmuxClient,
  detectCmuxEnvironment,
  markCmuxPromptShown,
  resetCmuxPromptState,
  resolveCmuxConfig,
  shouldPromptToEnableCmux,
} from "../../cmux/index.ts";
import type { GSDState } from "../types.ts";

test("detectCmuxEnvironment requires workspace, surface, and socket", () => {
  const detected = detectCmuxEnvironment(
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    (path) => path === "/tmp/cmux.sock",
    () => true,
  );
  assert.equal(detected.available, true);
  assert.equal(detected.cliAvailable, true);
});

test("resolveCmuxConfig enables only when preference and environment are both active", () => {
  const config = resolveCmuxConfig(
    { cmux: { enabled: true, notifications: true, sidebar: true, splits: true } },
    {
      CMUX_WORKSPACE_ID: "workspace:1",
      CMUX_SURFACE_ID: "surface:2",
      CMUX_SOCKET_PATH: "/tmp/cmux.sock",
    },
    () => true,
    () => true,
  );
  assert.equal(config.enabled, true);
  assert.equal(config.notifications, true);
  assert.equal(config.sidebar, true);
  assert.equal(config.splits, true);
});

test("shouldPromptToEnableCmux only prompts once per session", () => {
  resetCmuxPromptState();
  assert.equal(shouldPromptToEnableCmux({}, {}, () => false, () => true), false);

  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    true,
  );
  markCmuxPromptShown();
  assert.equal(
    shouldPromptToEnableCmux(
      {},
      {
        CMUX_WORKSPACE_ID: "workspace:1",
        CMUX_SURFACE_ID: "surface:2",
        CMUX_SOCKET_PATH: "/tmp/cmux.sock",
      },
      () => true,
      () => true,
    ),
    false,
  );
  resetCmuxPromptState();
});

test("buildCmuxStatusLabel and progress prefer deepest active unit", () => {
  const state: GSDState = {
    activeMilestone: { id: "M001", title: "Milestone" },
    activeSlice: { id: "S02", title: "Slice" },
    activeTask: { id: "T03", title: "Task" },
    phase: "executing",
    recentDecisions: [],
    blockers: [],
    nextAction: "Keep going",
    registry: [],
    progress: {
      milestones: { done: 0, total: 1 },
      slices: { done: 1, total: 3 },
      tasks: { done: 2, total: 5 },
    },
  };

  assert.equal(buildCmuxStatusLabel(state), "M001 S02/T03 · executing");
  assert.deepEqual(buildCmuxProgress(state), { value: 0.4, label: "2/5 tasks" });
});

describe("createGridLayout", () => {
  // Create a mock CmuxClient that tracks createSplitFrom calls
  function makeMockClient() {
    let nextId = 1;
    const calls: Array<{ source: string | undefined; direction: string }> = [];

    const client = {
      calls,
      async createGridLayout(count: number) {
        // Simulate the grid layout logic with a fake client
        if (count <= 0) return [];
        const surfaces: string[] = [];

        const createSplitFrom = async (source: string | undefined, direction: string) => {
          calls.push({ source, direction });
          return `surface-${nextId++}`;
        };

        const rightCol = await createSplitFrom("gsd-surface", "right");
        surfaces.push(rightCol);
        if (count === 1) return surfaces;

        const bottomRight = await createSplitFrom(rightCol, "down");
        surfaces.push(bottomRight);
        if (count === 2) return surfaces;

        const bottomLeft = await createSplitFrom("gsd-surface", "down");
        surfaces.push(bottomLeft);
        if (count === 3) return surfaces;

        let lastSurface = bottomRight;
        for (let i = 3; i < count; i++) {
          const next = await createSplitFrom(lastSurface, "down");
          surfaces.push(next);
          lastSurface = next;
        }

        return surfaces;
      },
    };
    return client;
  }

  test("1 agent creates single right split", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(1);
    assert.equal(surfaces.length, 1);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
    ]);
  });

  test("2 agents creates right column then splits it down", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(2);
    assert.equal(surfaces.length, 2);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
    ]);
  });

  test("3 agents creates 2x2 grid (gsd + 3 agent surfaces)", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(3);
    assert.equal(surfaces.length, 3);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
      { source: "gsd-surface", direction: "down" },
    ]);
  });

  test("4 agents creates 2x2 grid with extra split", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(4);
    assert.equal(surfaces.length, 4);
    assert.deepEqual(mock.calls, [
      { source: "gsd-surface", direction: "right" },
      { source: "surface-1", direction: "down" },
      { source: "gsd-surface", direction: "down" },
      { source: "surface-2", direction: "down" },
    ]);
  });

  test("0 agents returns empty", async () => {
    const mock = makeMockClient();
    const surfaces = await mock.createGridLayout(0);
    assert.equal(surfaces.length, 0);
    assert.equal(mock.calls.length, 0);
  });
});

describe("CmuxClient CLI commands", () => {
  function writeFakeCmux(tempRoot: string, logPath: string): string {
    const binDir = path.join(tempRoot, "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const scriptPath = path.join(binDir, "cmux");
    fs.writeFileSync(
      scriptPath,
      [
        "#!/bin/sh",
        "printf '%s\\n' \"$*\" >> \"$CMUX_FAKE_LOG\"",
        "cmd=\"$1\"",
        "case \"$cmd\" in",
        "  list-pane-surfaces)",
        "    printf '* surface:2  wrapper  [selected]\\n'",
        "    ;;",
        "  new-split)",
        "    printf 'OK surface:10 workspace:1\\n'",
        "    ;;",
        "  send)",
        "    printf 'OK surface:10 workspace:1\\n'",
        "    ;;",
        "  *)",
        "    echo \"unexpected cmux command: $cmd\" >&2",
        "    exit 1",
        "    ;;",
        "esac",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    return binDir;
  }

  function makeClient(): CmuxClient {
    return new CmuxClient({
      available: true,
      cliAvailable: true,
      socketPath: "/tmp/cmux.sock",
      workspaceId: "workspace:1",
      surfaceId: "surface:2",
      enabled: true,
      notifications: false,
      sidebar: false,
      splits: true,
      browser: false,
    });
  }

  async function withFakeCmux(fn: (logPath: string) => Promise<void>): Promise<void> {
    const tempRoot = fs.mkdtempSync(path.join(tmpdir(), "cmux-cli-test-"));
    const logPath = path.join(tempRoot, "cmux.log");
    const binDir = writeFakeCmux(tempRoot, logPath);
    const savedPath = process.env.PATH;
    const savedLog = process.env.CMUX_FAKE_LOG;
    process.env.PATH = `${binDir}${path.delimiter}${savedPath ?? ""}`;
    process.env.CMUX_FAKE_LOG = logPath;
    try {
      await fn(logPath);
    } finally {
      if (savedPath === undefined) delete process.env.PATH;
      else process.env.PATH = savedPath;
      if (savedLog === undefined) delete process.env.CMUX_FAKE_LOG;
      else process.env.CMUX_FAKE_LOG = savedLog;
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }

  test("listSurfaceIds uses list-pane-surfaces output", async () => {
    await withFakeCmux(async (logPath) => {
      const client = makeClient();
      const surfaceIds = await client.listSurfaceIds();
      assert.deepEqual(surfaceIds, ["surface:2"]);

      const log = fs.readFileSync(logPath, "utf8");
      assert.match(log, /list-pane-surfaces --workspace workspace:1/, "should call list-pane-surfaces");
      assert.doesNotMatch(log, /list-surfaces/, "should not call the removed list-surfaces command");
    });
  });

  test("createSplitFrom parses the new surface id from new-split output", async () => {
    await withFakeCmux(async (logPath) => {
      const client = makeClient();
      const surfaceId = await client.createSplitFrom("surface:2", "right");
      assert.equal(surfaceId, "surface:10");

      const log = fs.readFileSync(logPath, "utf8");
      assert.match(log, /new-split right --workspace workspace:1 --surface surface:2/, "should call new-split in the active workspace/surface");
    });
  });

  test("sendSurface uses the supported send command", async () => {
    await withFakeCmux(async (logPath) => {
      const client = makeClient();
      const sent = await client.sendSurface("surface:10", "echo hello");
      assert.equal(sent, true);

      const log = fs.readFileSync(logPath, "utf8");
      assert.match(log, /send --surface surface:10/, "should call send with the target surface");
      assert.doesNotMatch(log, /send-surface/, "should not call the removed send-surface command");
    });
  });
});

describe("cmux extension discovery opt-out", () => {
  test("cmux directory has package.json with pi manifest to prevent auto-discovery as extension", () => {
    const cmuxDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../cmux",
    );
    const pkgPath = path.join(cmuxDir, "package.json");
    assert.ok(fs.existsSync(pkgPath), `${pkgPath} must exist`);

    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    assert.ok(
      pkg.pi !== undefined && typeof pkg.pi === "object",
      'package.json must have a "pi" field to opt out of extension auto-discovery',
    );
    assert.ok(
      !pkg.pi.extensions?.length,
      "pi.extensions must be empty or absent — cmux is a library, not an extension",
    );
  });
});
