import test from "node:test"
import assert from "node:assert/strict"
import { join } from "node:path"

import {
  resolveAutoDashboardSubprocessConfig,
} from "../web/auto-dashboard-service.ts"
import {
  resolveWorkspaceIndexSubprocessConfig,
} from "../web/bridge-service.ts"

// ---------------------------------------------------------------------------
// Issue #1959 — packaged-standalone subprocess must use compiled JS, not TS
// ---------------------------------------------------------------------------
// When GSD is installed via npm, source files live under node_modules/.
// Node.js rejects --experimental-strip-types for files under node_modules/
// (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING), and
// --experimental-transform-types requires @swc/wasm-typescript which may
// not be installed.
//
// The fix: when packageRoot is under node_modules/, use the pre-compiled
// dist/ JS files and skip type-stripping flags entirely.

// ── Auto Dashboard ──────────────────────────────────────────────────────────

test("auto-dashboard subprocess: uses dist/auto.js when packageRoot is under node_modules/", () => {
  const packageRoot = "/opt/homebrew/lib/node_modules/gsd-pi"
  const config = resolveAutoDashboardSubprocessConfig(packageRoot, {
    existsSync: () => true,
    env: {} as NodeJS.ProcessEnv,
  })

  const expectedDistPath = join(packageRoot, "dist", "resources", "extensions", "gsd", "auto.js")
  assert.equal(config.modulePath, expectedDistPath, "must resolve to dist/auto.js")
  assert.ok(!config.args.includes("--experimental-strip-types"), "must not use --experimental-strip-types")
  assert.ok(!config.args.includes("--experimental-transform-types"), "must not use --experimental-transform-types")
  assert.ok(!config.args.some((a: string) => a.includes("resolve-ts.mjs")), "must not use resolve-ts.mjs loader")
})

test("auto-dashboard subprocess: uses src/auto.ts when packageRoot is NOT under node_modules/", () => {
  const packageRoot = "/home/user/projects/gsd-2"
  const config = resolveAutoDashboardSubprocessConfig(packageRoot, {
    existsSync: () => true,
    env: {} as NodeJS.ProcessEnv,
  })

  const expectedSrcPath = join(packageRoot, "src", "resources", "extensions", "gsd", "auto.ts")
  assert.equal(config.modulePath, expectedSrcPath, "must resolve to src/auto.ts")
  const hasTypeFlag = config.args.some((a: string) =>
    a === "--experimental-strip-types" || a === "--experimental-transform-types",
  )
  assert.ok(hasTypeFlag, "must include a type-stripping flag for TS source")
})

test("auto-dashboard subprocess: falls back to src/auto.ts when dist/auto.js does not exist under node_modules/", () => {
  const packageRoot = "/opt/homebrew/lib/node_modules/gsd-pi"
  const distPath = join(packageRoot, "dist", "resources", "extensions", "gsd", "auto.js")

  const config = resolveAutoDashboardSubprocessConfig(packageRoot, {
    existsSync: (p: string) => p !== distPath, // dist file does not exist
    env: {} as NodeJS.ProcessEnv,
  })

  const expectedSrcPath = join(packageRoot, "src", "resources", "extensions", "gsd", "auto.ts")
  assert.equal(config.modulePath, expectedSrcPath, "must fall back to src/auto.ts when dist not available")
})

// ── Workspace Index ─────────────────────────────────────────────────────────

test("workspace-index subprocess: uses dist/workspace-index.js when packageRoot is under node_modules/", () => {
  const packageRoot = "/opt/homebrew/lib/node_modules/gsd-pi"
  const config = resolveWorkspaceIndexSubprocessConfig(packageRoot, {
    existsSync: () => true,
  })

  const expectedDistPath = join(packageRoot, "dist", "resources", "extensions", "gsd", "workspace-index.js")
  assert.equal(config.modulePath, expectedDistPath, "must resolve to dist/workspace-index.js")
  assert.ok(!config.args.includes("--experimental-strip-types"), "must not use --experimental-strip-types")
  assert.ok(!config.args.includes("--experimental-transform-types"), "must not use --experimental-transform-types")
  assert.ok(!config.args.some((a: string) => a.includes("resolve-ts.mjs")), "must not use resolve-ts.mjs loader")
})

test("workspace-index subprocess: uses src/workspace-index.ts when packageRoot is NOT under node_modules/", () => {
  const packageRoot = "/home/user/projects/gsd-2"
  const config = resolveWorkspaceIndexSubprocessConfig(packageRoot, {
    existsSync: () => true,
  })

  const expectedSrcPath = join(packageRoot, "src", "resources", "extensions", "gsd", "workspace-index.ts")
  assert.equal(config.modulePath, expectedSrcPath, "must resolve to src/workspace-index.ts")
  const hasTypeFlag = config.args.some((a: string) =>
    a === "--experimental-strip-types" || a === "--experimental-transform-types",
  )
  assert.ok(hasTypeFlag, "must include a type-stripping flag for TS source")
})

test("workspace-index subprocess: falls back to src/workspace-index.ts when dist file missing under node_modules/", () => {
  const packageRoot = "/opt/homebrew/lib/node_modules/gsd-pi"
  const distPath = join(packageRoot, "dist", "resources", "extensions", "gsd", "workspace-index.js")

  const config = resolveWorkspaceIndexSubprocessConfig(packageRoot, {
    existsSync: (p: string) => p !== distPath,
  })

  const expectedSrcPath = join(packageRoot, "src", "resources", "extensions", "gsd", "workspace-index.ts")
  assert.equal(config.modulePath, expectedSrcPath, "must fall back to src/workspace-index.ts when dist not available")
})

// ── Windows path handling ───────────────────────────────────────────────────

test("auto-dashboard subprocess: detects node_modules in Windows-style paths", () => {
  const packageRoot = "C:\\Users\\dev\\AppData\\node_modules\\gsd-pi"
  const config = resolveAutoDashboardSubprocessConfig(packageRoot, {
    existsSync: () => true,
    env: {} as NodeJS.ProcessEnv,
  })

  const expectedDistPath = join(packageRoot, "dist", "resources", "extensions", "gsd", "auto.js")
  assert.equal(config.modulePath, expectedDistPath, "must detect node_modules in Windows paths")
})
