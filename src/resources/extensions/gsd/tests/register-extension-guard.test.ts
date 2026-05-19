import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";

import { handleRecoverableExtensionProcessError } from "../bootstrap/register-extension.ts";

test("handleRecoverableExtensionProcessError swallows spawn ENOENT", () => {
  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const handled = handleRecoverableExtensionProcessError(
      Object.assign(new Error("missing binary"), {
        code: "ENOENT",
        syscall: "spawn npm",
        path: "npm",
      }),
    );
    assert.equal(handled, true);
    assert.match(stderr, /spawn ENOENT: npm/);
  } finally {
    process.stderr.write = originalWrite;
  }
});

test("handleRecoverableExtensionProcessError swallows uv_cwd ENOENT", () => {
  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const handled = handleRecoverableExtensionProcessError(
      Object.assign(new Error("process.cwd failed"), {
        code: "ENOENT",
        syscall: "uv_cwd",
      }),
    );
    assert.equal(handled, true);
    assert.match(stderr, /ENOENT \(uv_cwd\): process\.cwd failed/);
  } finally {
    process.stderr.write = originalWrite;
  }
});

test("handleRecoverableExtensionProcessError leaves unrelated errors unhandled", () => {
  const handled = handleRecoverableExtensionProcessError(
    Object.assign(new Error("permission denied"), {
      code: "EPERM",
      syscall: "open",
    }),
  );
  assert.equal(handled, false);
});

test("handleRecoverableExtensionProcessError swallows EPIPE, warns, and writes crash log when stdout is alive", () => {
  const tmpHome = join(tmpdir(), `gsd-epipe-test-${randomUUID()}`);
  const origHome = process.env.GSD_HOME;
  process.env.GSD_HOME = tmpHome;

  let stderr = "";
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const handled = handleRecoverableExtensionProcessError(
      Object.assign(new Error("broken pipe"), {
        code: "EPIPE",
        syscall: "write",
      }),
    );
    assert.equal(handled, true);
    assert.match(stderr, /swallowed EPIPE/);
    const crashDir = join(tmpHome, "crash");
    assert.equal(existsSync(crashDir), true);
    assert.equal(readdirSync(crashDir).some((f) => f.endsWith(".log")), true);
  } finally {
    process.stderr.write = originalWrite;
    process.env.GSD_HOME = origHome;
    rmSync(tmpHome, { recursive: true, force: true });
  }
});
