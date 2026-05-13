// V8 compile cache helpers — see cli.ts callsite and `gsd cache` subcommand.
//
// Node 22+ exposes `NODE_COMPILE_CACHE` to persist compiled bytecode across
// runs. We opt users in by pointing it at a directory under ~/.gsd/agent.
//
// Operator footgun the version-scoped subdir mitigates:
//   When a user reinstalls or patches gsd-pi's dist files in place, Node's
//   cache key (which keys on filename + size + mtime + node version) can
//   under rare conditions serve stale bytecode for the patched module — at
//   minimum on macOS APFS where filesystem timestamp granularity has
//   historically tripped up similar caches. Embedding the gsd-pi package
//   version in the cache subpath guarantees that any `npm install -g gsd-pi`
//   transition implicitly invalidates the cache, because the directory path
//   itself changes.
//
// Users who hit a stale-cache trap on the same gsd-pi version (e.g. mid-debug
// patching of dist files) can still recover via `gsd cache clear`. See
// docs/user-docs/troubleshooting.md.

import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Compute the directory `NODE_COMPILE_CACHE` should point at. We scope by
 * gsd-pi version so an upgrade implicitly invalidates the cache, sidestepping
 * the rare case where Node's content-based key fails to notice a patched
 * source file.
 *
 * Exported as a pure function so it can be unit-tested without booting cli.ts.
 */
export function computeCompileCacheDir(agentDir: string, gsdVersion: string): string {
  const slug = sanitizeVersionForPath(gsdVersion) || 'unknown'
  return join(agentDir, '.compile-cache', `gsd-${slug}`)
}

/**
 * Root directory holding every per-version compile-cache subdir. `gsd cache
 * clear` removes this entire tree so users don't have to know the version
 * slug.
 */
export function compileCacheRoot(agentDir: string): string {
  return join(agentDir, '.compile-cache')
}

function sanitizeVersionForPath(v: string): string {
  // Defense in depth — semver characters are filesystem-safe, but a tampered
  // GSD_VERSION env var should not be able to write outside the cache root.
  return v.replace(/[^A-Za-z0-9._-]/g, '_')
}

/**
 * Synchronously remove the compile-cache root. Returns whether the directory
 * existed (so the CLI can print a useful message).
 */
export function clearCompileCache(agentDir: string): { existed: boolean; path: string } {
  const path = compileCacheRoot(agentDir)
  const existed = existsSync(path)
  if (existed) {
    rmSync(path, { recursive: true, force: true })
  }
  return { existed, path }
}
