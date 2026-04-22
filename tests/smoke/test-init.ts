import { execFileSync } from "child_process";
import { mkdtempSync, existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// Skip in non-TTY environments — init requires interactive mode.
// Allow explicit override for local debugging.
if (!process.stdin.isTTY && process.env.GSD_SMOKE_FORCE_TTY_TESTS !== "1") {
  console.log("  SKIP  test-init (no TTY available)");
  process.exit(0);
}

const tmpDir = mkdtempSync(join(tmpdir(), "gsd-smoke-init-"));

try {
  const binary = process.env.GSD_SMOKE_BINARY || "npx";
  const args = process.env.GSD_SMOKE_BINARY ? ["init"] : ["gsd-pi", "init"];

  execFileSync(binary, args, {
    encoding: "utf8",
    timeout: 30_000,
    cwd: tmpDir,
    env: { ...process.env, GSD_NON_INTERACTIVE: "1" },
  });

  const gsdDir = join(tmpDir, ".gsd");
  if (!existsSync(gsdDir)) {
    console.error(`.gsd directory not created in ${tmpDir}`);
    process.exit(1);
  }
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
