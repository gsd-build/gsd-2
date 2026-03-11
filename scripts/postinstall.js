#!/usr/bin/env node
import { execSync } from 'child_process'
import { createRequire } from 'module'
import os from 'os'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require(resolve(__dirname, '..', 'package.json'))

// Colors
const cyan    = '\x1b[36m'
const green   = '\x1b[32m'
const yellow  = '\x1b[33m'
const dim     = '\x1b[2m'
const reset   = '\x1b[0m'

const banner =
  '\n' +
  cyan +
  '   ██████╗ ███████╗██████╗ \n' +
  '  ██╔════╝ ██╔════╝██╔══██╗\n' +
  '  ██║  ███╗███████╗██║  ██║\n' +
  '  ██║   ██║╚════██║██║  ██║\n' +
  '  ╚██████╔╝███████║██████╔╝\n' +
  '   ╚═════╝ ╚══════╝╚═════╝ ' +
  reset + '\n' +
  '\n' +
  `  Get Shit Done ${dim}v${pkg.version}${reset}\n` +
  `  A standalone coding agent that plans, executes, and ships.\n` +
  '\n' +
  `  ${green}✓${reset} Installed successfully\n` +
  `  ${dim}Run ${reset}${cyan}gsd${reset}${dim} to get started.${reset}\n`

function run(command, options = {}) {
  return execSync(command, {
    cwd: resolve(__dirname, '..'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  })
}

function printCaptured(output) {
  if (output) process.stderr.write(output)
}

process.stderr.write(banner)

// Apply patches to upstream dependencies (non-fatal)
try {
  const output = run('npx patch-package')
  printCaptured(output)
  process.stderr.write(`\n  ${green}✓${reset} Patches applied\n`)
} catch (error) {
  printCaptured(error.stdout)
  printCaptured(error.stderr)
  process.stderr.write(`\n  ${yellow}⚠${reset}  Failed to apply patches — run ${cyan}npx patch-package${reset} manually\n`)
}

// Install Playwright chromium for browser tools (non-fatal).
// We intentionally avoid --with-deps here because install scripts should not
// block on interactive sudo prompts. Playwright validates host requirements
// after download; if Linux libs are missing, suggest the explicit follow-up.
try {
  const output = run('npx playwright install chromium')
  printCaptured(output)
  process.stderr.write(`\n  ${green}✓${reset} Browser tools ready\n\n`)
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
  printCaptured(output)

  if (os.platform() === 'linux' && output.includes('Host system is missing dependencies to run browsers.')) {
    process.stderr.write(
      `\n  ${yellow}⚠${reset}  Browser downloaded, but Linux system dependencies are missing.\n` +
      `  ${dim}Run ${reset}${cyan}sudo npx playwright install-deps chromium${reset}${dim} to finish setup.${reset}\n\n`
    )
  } else {
    process.stderr.write(
      `\n  ${yellow}⚠${reset}  Browser tools unavailable — run ${cyan}npx playwright install chromium${reset} to enable\n\n`
    )
  }
}
