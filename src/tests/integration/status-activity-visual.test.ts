import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const loaderPath = join(projectRoot, "dist", "loader.js");
const extensionPath = join(projectRoot, "src", "tests", "integration", "fixtures", "status-activity-visual-extension.ts");
const scriptBin = process.env.GSD_TEST_SCRIPT_BIN || "script";
const spinnerFramePattern = /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+VISUAL-SPIN-PHASE-[12]/g;

const scriptProbe = spawnSync(scriptBin, ["--version"], { encoding: "utf-8" });
const scriptMissing = (scriptProbe.error as NodeJS.ErrnoException | undefined)?.code === "ENOENT";

const skipReason =
  process.env.CI
    ? "requires interactive PTY — skip in CI"
    : process.platform === "win32"
      ? "requires POSIX PTY (script)"
      : scriptMissing
        ? `${scriptBin} not found in PATH`
        : !existsSync(loaderPath)
          ? "dist/loader.js not found — run npm run build"
          : !existsSync(extensionPath)
            ? "test extension fixture missing"
            : undefined;

type PtyResult = {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
};

function stripAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
}

function runVisualSession(): Promise<PtyResult> {
  return new Promise((resolve, reject) => {
    const captureDir = mkdtempSync(join(tmpdir(), "gsd-status-activity-visual-"));
    const tempHome = mkdtempSync(join(tmpdir(), "gsd-status-activity-home-"));
    const agentDir = join(tempHome, ".gsd", "agent");
    const agentExtDir = join(agentDir, "extensions");
    const transcriptPath = join(captureDir, "typescript.log");
    const command = `node ${shellQuote(loaderPath)}`;
    let timedOut = false;
    let output = "";

    mkdirSync(agentExtDir, { recursive: true });
    copyFileSync(extensionPath, join(agentExtDir, "status-activity-visual-extension.ts"));

    const child = spawn(scriptBin, ["-qefc", command, transcriptPath], {
      cwd: projectRoot,
      env: {
        ...process.env,
        HOME: tempHome,
        GSD_CODING_AGENT_DIR: agentDir,
        PI_SKIP_VERSION_CHECK: "1",
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });

    child.on("error", (error) => {
      try {
        rmSync(captureDir, { recursive: true, force: true });
        rmSync(tempHome, { recursive: true, force: true });
      } catch {
        // ignore cleanup error
      }
      reject(error);
    });

    const kickOffTimer = setTimeout(() => {
      child.stdin.write("/sv\n");
    }, 3_000);

    const exitTimer = setTimeout(() => {
      child.stdin.write("/exit\n");
    }, 9_000);
    const exitInterval = setInterval(() => {
      child.stdin.write("/exit\n");
    }, 2_000);

    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, 60_000);

    child.on("close", (code) => {
      clearTimeout(kickOffTimer);
      clearTimeout(exitTimer);
      clearTimeout(timeoutTimer);
      clearInterval(exitInterval);

      try {
        if (existsSync(transcriptPath)) {
          output += readFileSync(transcriptPath, "utf-8");
        }
      } finally {
        rmSync(captureDir, { recursive: true, force: true });
        rmSync(tempHome, { recursive: true, force: true });
      }

      resolve({
        output,
        exitCode: code,
        timedOut,
      });
    });
  });
}

test(
  "interactive TUI visibly renders status activity spinner frames for extension commands",
  { skip: skipReason },
  async () => {
    const result = await runVisualSession();
    const output = stripAnsi(result.output);

    assert.equal(result.timedOut, false, `session timed out\n${output.slice(-3_000)}`);
    assert.equal(result.exitCode, 0, `expected clean exit, got ${result.exitCode}\n${output.slice(-3_000)}`);

    assert.match(output, /VISUAL-SPIN-PHASE-1/, "phase 1 message should render in TUI");
    assert.match(output, /VISUAL-SPIN-PHASE-2/, "phase 2 message should render in TUI");
    assert.doesNotMatch(output, /VISUAL-SPIN-DONE/, "fixture should not emit a persistent done status");

    const spinnerMatches = [...output.matchAll(spinnerFramePattern)];
    assert.ok(
      spinnerMatches.length >= 2,
      `expected at least two spinner renders, saw ${spinnerMatches.length}\n${output.slice(-3_000)}`,
    );

    const uniqueFrames = new Set(spinnerMatches.map((match) => match[0][0]));
    assert.ok(
      uniqueFrames.size >= 2,
      `expected animated spinner (>=2 frames), saw ${[...uniqueFrames].join(", ") || "none"}\n${output.slice(-3_000)}`,
    );
  },
);
