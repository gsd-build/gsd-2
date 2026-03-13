#!/usr/bin/env node

/**
 * Dev supervisor — runs tsc --watch and watch-resources.js in parallel.
 *
 * Both processes terminate together when either exits or when the parent
 * receives SIGINT/SIGTERM. This avoids the problem with shell backgrounding
 * (`&`) where the watcher can outlive tsc and orphan.
 */

import { spawn } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

const procs = [
  spawn('node', [resolve(__dirname, 'watch-resources.js')], {
    cwd: root, stdio: 'inherit'
  }),
  spawn('npx', ['tsc', '--watch'], {
    cwd: root, stdio: 'inherit'
  })
]

function cleanup() {
  for (const p of procs) {
    try { p.kill() } catch {}
  }
}

// If either child exits, kill the other and exit with its code
for (const p of procs) {
  p.on('exit', (code) => {
    cleanup()
    process.exit(code ?? 1)
  })
}

// Forward signals to children
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanup()
    process.exit(0)
  })
}
