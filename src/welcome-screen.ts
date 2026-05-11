// Project/App: GSD-2
// File Purpose: Startup welcome screen rendering for the GSD terminal experience.

/**
 * GSD Welcome Screen
 *
 * Command-center layout: rounded terminal card with compact logo, project
 * state, primary action, branch/workspace, and secondary hints.
 * Falls back to simple text on narrow terminals (<70 cols) or non-TTY.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import os from 'node:os'
import chalk from 'chalk'
import stripAnsi from 'strip-ansi'
import { GSD_LOGO } from './logo.js'

interface GsdState {
  milestone?: string
  phase?: string
  slice?: string
  nextAction?: string
}

function readGsdState(): GsdState | undefined {
  try {
    const raw = readFileSync(join(process.cwd(), '.gsd', 'STATE.md'), 'utf-8')
    const state: GsdState = {}
    const milestone = raw.match(/^\*\*Active Milestone:\*\*\s*(.+)$/m)
    if (milestone) state.milestone = milestone[1].trim()
    const slice = raw.match(/^\*\*Active Slice:\*\*\s*(.+)$/m)
    if (slice) state.slice = slice[1].trim()
    const phase = raw.match(/^\*\*Phase:\*\*\s*(.+)$/m)
    if (phase) state.phase = phase[1].trim()
    // Accept both template shapes: inline "**Next Action:** ..." and the
    // "## Next Action\n<line>" heading format. Prefer the inline match.
    const nextInline = raw.match(/^\*\*Next Action:\*\*\s*(.+)$/m)
    const nextHeading = raw.match(/^##\s*Next Action\s*\n+([^\n]+)/m)
    const nextMatch = nextInline ?? nextHeading
    if (nextMatch) state.nextAction = nextMatch[1].trim()
    return state
  } catch {
    return undefined
  }
}

function countMcpServers(): number {
  const configPaths = [
    join(process.cwd(), '.mcp.json'),
    join(process.cwd(), '.gsd', 'mcp.json'),
  ]
  const seen = new Set<string>()
  for (const p of configPaths) {
    try {
      const raw = readFileSync(p, 'utf-8')
      const data = JSON.parse(raw) as Record<string, unknown>
      const servers = (data.mcpServers ?? data.servers) as
        | Record<string, unknown>
        | undefined
      if (!servers || typeof servers !== 'object') continue
      for (const name of Object.keys(servers)) seen.add(name)
    } catch {
      // missing or malformed config — ignore
    }
  }
  return seen.size
}

export interface WelcomeScreenOptions {
  version: string
  modelName?: string
  provider?: string
  remoteChannel?: string
  width?: number
}

function getShortCwd(): string {
  const cwd = process.cwd()
  const home = os.homedir()
  return cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd
}

/** Visible length — strips ANSI escape codes before measuring. */
function visLen(s: string): number {
  return stripAnsi(s).length
}

/** Right-pad a string to the given visible width. */
function rpad(s: string, w: number): string {
  const clamped = clampVisible(s, w)
  return clamped + ' '.repeat(Math.max(0, w - visLen(clamped)))
}

function rightAlign(left: string, right: string, width: number): string {
  if (!right) return clampVisible(left, width)
  const gap = Math.max(1, width - visLen(left) - visLen(right))
  return clampVisible(left + ' '.repeat(gap) + right, width)
}

function frameLine(content: string, width: number): string {
  const inner = Math.max(1, width - 2)
  return chalk.hex('#a7ba78')('│') + rpad(content, inner) + chalk.hex('#a7ba78')('│')
}

/** Clamp rendered terminal output by visible columns. Falls back to plain text only when truncating. */
function clampVisible(s: string, w: number): string {
  if (w <= 0) return ''
  if (visLen(s) <= w) return s
  const plain = stripAnsi(s)
  return plain.slice(0, Math.max(0, w - 1)) + '…'
}

export function buildWelcomeScreenLines(opts: WelcomeScreenOptions): string[] {
  const { version, remoteChannel } = opts
  const shortCwd = getShortCwd()
  const termWidth = Math.max(1, (opts.width ?? process.stderr.columns ?? 80) - 1)

  // Narrow terminal fallback
  if (termWidth < 70) {
    return ['', `  Get Shit Done v${version}`, `  ${shortCwd}`, '']
  }

  const toolParts: string[] = []
  if (process.env.BRAVE_API_KEY)      toolParts.push('Brave ✓')
  if (process.env.BRAVE_ANSWERS_KEY)  toolParts.push('Answers ✓')
  if (process.env.JINA_API_KEY)       toolParts.push('Jina ✓')
  if (process.env.TAVILY_API_KEY)     toolParts.push('Tavily ✓')
  if (process.env.CONTEXT7_API_KEY)   toolParts.push('Context7 ✓')
  if (remoteChannel)                  toolParts.push(`${remoteChannel.charAt(0).toUpperCase() + remoteChannel.slice(1)} ✓`)

  const innerWidth = Math.max(1, termWidth - 2)
  const logoWidth = Math.max(...GSD_LOGO.map((line) => visLen(line)))
  const divider = ` ${chalk.dim('│')} `
  const panelWidth = innerWidth - logoWidth - visLen(divider)
  if (panelWidth < 44) {
    return ['', `  Get Shit Done v${version}`, `  ${shortCwd}`, '']
  }

  // "Welcome back" context lines — GSD state if available, else hint.
  // Intentionally avoids data already shown in the footer (model, provider,
  // pwd, branch).
  const state = readGsdState()
  let projectText = 'No active GSD project'
  let commandText = '/gsd start'
  let modeText = 'manual'
  if (state?.milestone) {
    const statusParts = [state.milestone, state.phase, state.slice].filter(Boolean)
    projectText = statusParts.join(' · ')
    const maxActionWidth = Math.max(10, panelWidth - 30)
    commandText = state.nextAction ? clampVisible(state.nextAction, maxActionWidth) : '/gsd next'
    modeText = state.phase ?? 'active'
  }

  const mcpCount = countMcpServers()
  const mcpText = toolParts.length > 0
    ? toolParts.join('  ·  ')
    : mcpCount > 0
      ? `${mcpCount} server${mcpCount === 1 ? '' : 's'} configured`
      : 'none configured'

  const label = (s: string) => chalk.dim(s)
  const value = (s: string) => chalk.hex('#dce4f2')(s)
  const accent = (s: string) => chalk.hex('#8db7ff')(s)
  const panelRows = [
    rightAlign(`${accent('GSD')} ${chalk.bold(value('Project Console'))}`, chalk.dim(`v${version}`), panelWidth),
    rightAlign(`${label('Project')} ${value(projectText)}`, `${label('Command')} ${accent(commandText)}`, panelWidth),
    rightAlign(`${label('Workspace')} ${value(shortCwd)}`, `${label('Mode')} ${value(modeText)}`, panelWidth),
    rightAlign(`${label('MCP')} ${chalk.dim(mcpText)}`, `${label('Status')} ${value(state?.milestone ? 'active' : 'idle')}`, panelWidth),
    rightAlign(`${label('Next')} ${accent('/gsd to begin')}`, `${label('Setup')} ${accent('/gsd start')}`, panelWidth),
    rightAlign(chalk.dim('/gsd templates'), chalk.dim('/gsd help'), panelWidth),
  ]

  // ── Render ──────────────────────────────────────────────────────────────────
  const out: string[] = ['']
  out.push(chalk.hex('#a7ba78')('╭' + '─'.repeat(termWidth - 2) + '╮'))
  for (let i = 0; i < GSD_LOGO.length; i++) {
    const logo = rpad(chalk.hex('#a7ba78')(GSD_LOGO[i]), logoWidth)
    out.push(frameLine(`${logo}${divider}${panelRows[i] ?? ''}`, termWidth))
  }
  out.push(chalk.hex('#a7ba78')('╰' + '─'.repeat(termWidth - 2) + '╯'))
  out.push('')

  return out.map((line) => clampVisible(line, termWidth))
}

export function printWelcomeScreen(opts: WelcomeScreenOptions): void {
  if (!process.stderr.isTTY) return
  process.stderr.write(buildWelcomeScreenLines(opts).join('\n') + '\n')
}
