/**
 * session-picker.ts
 *
 * Interactive terminal session picker — alternate screen, arrow-key navigation,
 * responsive layout (wide table ↔ compact 2-line rows).
 *
 * Exported surface:
 *   runSessionPicker(exitOnCancel, cwd, sessions, onSelect)
 *
 * Pure I/O: no direct imports of cliFlags or SessionManager — callers own
 * those dependencies so this module is independently testable.
 */

import chalk from 'chalk'

// ── ANSI escape sequences ─────────────────────────────────────────────────
const ESC            = '\x1B'
const HIDE_CURSOR    = `${ESC}[?25l`
const SHOW_CURSOR    = `${ESC}[?25h`
const ALT_SCREEN_ON  = `${ESC}[?1049h`
const ALT_SCREEN_OFF = `${ESC}[?1049l`
const CLEAR_SCREEN   = `${ESC}[2J${ESC}[H`

// ── Public types ──────────────────────────────────────────────────────────

export interface PickerSession {
  path: string
  name?: string
  firstMessage?: string
  modified: Date
  messageCount: number
}

export type PickerResult =
  | { kind: 'selected'; session: PickerSession }
  | { kind: 'new' }
  | { kind: 'cancelled' }

// ── Layout helpers (exported for unit tests) ──────────────────────────────

/** Strip ANSI escape codes to get visible character length. */
export function visLen(s: string): number {
  return s.replace(/\x1B\[[0-9;]*m/g, '').length
}

/**
 * Pad or truncate `text` to exactly `len` visible characters.
 * Truncated strings end with '…'. Alignment applies only when padding.
 * Always operates on plain text — apply chalk *after* calling cell().
 */
export function cell(text: string, len: number, align: 'left' | 'right' = 'left'): string {
  const vl = visLen(text)
  const diff = len - vl
  if (diff < 0) {
    let result = ''
    let count = 0
    for (const ch of text.replace(/\x1B\[[0-9;]*m/g, '')) {
      if (count >= len - 1) { result += '…'; break }
      result += ch; count++
    }
    return result
  }
  if (align === 'right') return ' '.repeat(diff) + text
  return text + ' '.repeat(diff)
}

/**
 * Format a date for display in the picker.
 * Width varies by locale — Spanish ≈ 24 chars, English ≈ 21 chars.
 */
export function formatDate(d: Date): string {
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// Fixed column widths — locale-aware date width measured once at import time
const COL_NUM  = 3  // right-aligned: " 1" … "10"
const COL_MSGS = 4  // right-aligned: "  30"
const SAMPLE_DATE = new Date(2026, 11, 31, 23, 59)
export const COL_DATE = Math.max(formatDate(SAMPLE_DATE).length, 20)

/**
 * Compute layout values from the current terminal width.
 * Called on every render so resize is reflected immediately.
 */
export function getLayout(columns?: number) {
  const termWidth = columns ?? process.stderr.columns ?? 80
  // Row structure: "  │ NUM │ DATE │ MSGS │ TOPIC │"
  const TABLE_OVERHEAD = 2 + 1 + (COL_NUM + 2) + 1 + (COL_DATE + 2) + 1 + (COL_MSGS + 2) + 1 + 2
  const MIN_TABLE_WIDTH = TABLE_OVERHEAD + COL_NUM + COL_DATE + COL_MSGS + 12
  const useWide = termWidth >= MIN_TABLE_WIDTH
  const COL_TOPIC = Math.max(12, termWidth - TABLE_OVERHEAD - COL_NUM - COL_DATE - COL_MSGS)
  const compactWidth = Math.max(10, termWidth - 8)
  return { termWidth, useWide, COL_TOPIC, compactWidth }
}

// ── Rendering ─────────────────────────────────────────────────────────────

function tableRow(num: string, date: string, msgs: string, topic: string, colTopic: number): string {
  return (
    '  │ ' + cell(num, COL_NUM, 'right') +
    ' │ ' + cell(date, COL_DATE) +
    ' │ ' + cell(msgs, COL_MSGS, 'right') +
    ' │ ' + topic +  // topic already cell()'d by caller before chalk is applied
    ' │'
  )
}

function divider(l: string, m: string, r: string, colTopic: number): string {
  return (
    '  ' + l +
    '─'.repeat(COL_NUM + 2) + m +
    '─'.repeat(COL_DATE + 2) + m +
    '─'.repeat(COL_MSGS + 2) + m +
    '─'.repeat(colTopic + 2) + r
  )
}

function compactRow(
  num: string | null,
  date: string,
  msgs: string,
  topic: string,
  isSelected: boolean,
  cw: number,
): string[] {
  const selector = isSelected ? chalk.cyan('▶') : ' '
  const numStr = num !== null ? chalk.bold(num.padStart(2)) : ' 0'
  const meta = `${date}  ${chalk.dim(`(${msgs} msgs)`)}`
  const topicLine = cell(topic, cw)
  const line1 = `  ${selector} ${numStr}  ${meta}`
  const line2 = `      ${chalk.dim('└─')} ${isSelected ? chalk.white(topicLine) : chalk.dim(topicLine)}`
  return [line1, line2]
}

type PickerRow = { label: string; sessionIdx: number | null }

function renderTable(
  selectedIdx: number,
  rows: PickerRow[],
  toShow: PickerSession[],
  cwd: string,
  sessionCount: number,
  maxShow: number,
  exitOnCancel: boolean,
): string {
  const { termWidth, useWide, COL_TOPIC, compactWidth } = getLayout()
  const out: string[] = []
  out.push(chalk.bold(`\n  Sessions for ${chalk.cyan(cwd)}\n`))

  if (useWide) {
    out.push(divider('┌', '┬', '┐', COL_TOPIC))
    out.push(tableRow(chalk.bold(' # '), chalk.bold('Date'), chalk.bold('Msgs'), chalk.bold('Topic'), COL_TOPIC))
    out.push(divider('├', '┼', '┤', COL_TOPIC))

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const isSelected = i === selectedIdx

      if (r.sessionIdx === null) {
        const topicCell = cell('[ new conversation ]', COL_TOPIC)
        const line = tableRow(' 0 ', topicCell, '', '', COL_TOPIC)
        out.push(isSelected ? chalk.bgBlue(chalk.white(line)) : chalk.dim(line))
        out.push(divider('├', '┼', '┤', COL_TOPIC))
      } else {
        const s = toShow[r.sessionIdx]
        const numStr    = String(r.sessionIdx + 1)
        const dateStr   = formatDate(s.modified)
        const msgsStr   = String(s.messageCount)
        // Truncate/pad BEFORE chalk — cell() cannot see through ANSI codes
        const topicRaw  = cell(r.label, COL_TOPIC)
        const topicStr  = isSelected ? topicRaw : (s.name ? chalk.cyan(topicRaw) : chalk.white(topicRaw))
        const dateCol   = isSelected ? dateStr : chalk.green(dateStr)
        const msgsCol   = isSelected ? msgsStr : chalk.cyan(msgsStr)
        const line = tableRow(numStr, dateCol, msgsCol, topicStr, COL_TOPIC)
        out.push(isSelected ? chalk.bgBlue(chalk.white(line)) : line)
      }
    }

    out.push(divider('└', '┴', '┘', COL_TOPIC))

  } else {
    out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const isSelected = i === selectedIdx

      if (r.sessionIdx === null) {
        const selector = isSelected ? chalk.cyan('▶') : ' '
        const label = isSelected ? chalk.white('[ new conversation ]') : chalk.dim('[ new conversation ]')
        out.push(`  ${selector}  0  ${label}`)
        out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))
      } else {
        const s = toShow[r.sessionIdx]
        const lines = compactRow(
          String(r.sessionIdx + 1),
          isSelected ? formatDate(s.modified) : chalk.green(formatDate(s.modified)),
          String(s.messageCount),
          r.label,
          isSelected,
          compactWidth,
        )
        out.push(...lines)
      }
    }

    out.push('  ' + '─'.repeat(Math.max(10, termWidth - 4)))
  }

  if (sessionCount > maxShow) {
    const extra = sessionCount - maxShow
    // `gsd sessions` shows 20 sessions; startup shows 10 to keep the picker compact.
    // Either way, tell the user how many more exist.
    const hint = exitOnCancel ? '' : `  · ${chalk.bold('gsd sessions')} to see all`
    out.push(chalk.dim(`\n  ... and ${extra} more${hint}`))
  }

  const hint = exitOnCancel
    ? chalk.dim('  ↑↓ navigate  ·  Enter select  ·  Esc/q quit')
    : chalk.dim('  ↑↓ navigate  ·  Enter select  ·  Esc = new conversation')
  out.push('\n' + hint + '\n')

  return out.join('\n')
}

// ── Interactive key loop ──────────────────────────────────────────────────

async function interactiveSelect(
  rows: PickerRow[],
  toShow: PickerSession[],
  cwd: string,
  sessionCount: number,
  maxShow: number,
  exitOnCancel: boolean,
): Promise<{ chosen: number }> {
  return new Promise((resolve) => {
    let selected = 0

    // Alternate screen: picker lives here; original terminal restored on exit
    process.stderr.write(ALT_SCREEN_ON + HIDE_CURSOR)

    function paint() {
      process.stderr.write(
        CLEAR_SCREEN + renderTable(selected, rows, toShow, cwd, sessionCount, maxShow, exitOnCancel),
      )
    }

    paint()

    const stdin = process.stdin as NodeJS.ReadStream
    if (stdin.setRawMode) stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    function onKey(key: string) {
      if (key === '\x1B[A' || key === '\x1B[D') {
        selected = (selected - 1 + rows.length) % rows.length
        paint()
      } else if (key === '\x1B[B' || key === '\x1B[C') {
        selected = (selected + 1) % rows.length
        paint()
      } else if (key === '\r' || key === '\n') {
        cleanup()
        resolve({ chosen: selected })
      } else if (key === '\x1B' || key === 'q' || key === 'Q') {
        cleanup()
        resolve({ chosen: -1 })
      } else if (key === '\x03') {
        cleanup()
        process.stderr.write('\n')
        process.exit(0)
      }
    }

    // Poll for resize every 150ms — Windows Terminal doesn't fire the resize
    // event on maximize/restore, only on manual border drag.
    let lastCols = process.stderr.columns ?? 80
    const resizePoll = setInterval(() => {
      const cols = process.stderr.columns ?? 80
      if (cols !== lastCols) { lastCols = cols; paint() }
    }, 150)

    function onResize() { paint() }
    // Some terminals fire on stdout, others on stderr — listen to both
    process.stdout.on('resize', onResize)
    process.stderr.on('resize', onResize)

    function cleanup() {
      clearInterval(resizePoll)
      process.stdout.removeListener('resize', onResize)
      process.stderr.removeListener('resize', onResize)
      stdin.removeListener('data', onKey)
      if (stdin.setRawMode) stdin.setRawMode(false)
      stdin.pause()
      process.stderr.write(ALT_SCREEN_OFF + SHOW_CURSOR)
    }

    stdin.on('data', onKey)
  })
}

// ── Public entry point ────────────────────────────────────────────────────

/**
 * Show the interactive session picker.
 *
 * @param exitOnCancel  true  → used by `gsd sessions`: Esc/q exits the process.
 *                      false → used at startup: Esc means "start new session".
 * @param cwd           Working directory label shown in the header.
 * @param sessions      Full session list (sorted, most-recent first).
 * @returns             PickerResult describing what the user chose.
 *
 * maxShow behaviour:
 *   exitOnCancel=true  (gsd sessions subcommand) → shows up to 20 sessions
 *   exitOnCancel=false (startup picker)           → shows up to 10 sessions
 * The startup picker is intentionally compact; `gsd sessions` is the full view.
 */
export async function runSessionPicker(
  exitOnCancel: boolean,
  cwd: string,
  sessions: PickerSession[],
): Promise<PickerResult> {
  if (sessions.length === 0) {
    return { kind: 'cancelled' }
  }

  // exitOnCancel=true (gsd sessions) shows more; startup shows fewer to stay compact
  const maxShow = exitOnCancel ? 20 : 10
  const toShow = sessions.slice(0, maxShow)

  const rows: PickerRow[] = []
  if (!exitOnCancel) {
    rows.push({ label: '[ new conversation ]', sessionIdx: null })
  }
  for (let i = 0; i < toShow.length; i++) {
    const s = toShow[i]
    const topic = s.name || (s.firstMessage ? s.firstMessage.replace(/\n/g, ' ') : '(empty)')
    rows.push({ label: topic, sessionIdx: i })
  }

  const { chosen } = await interactiveSelect(rows, toShow, cwd, sessions.length, maxShow, exitOnCancel)

  // Restore stdin for the TUI that takes over after the picker
  process.stdin.removeAllListeners('data')
  process.stdin.removeAllListeners('keypress')
  if ((process.stdin as NodeJS.ReadStream).setRawMode) {
    (process.stdin as NodeJS.ReadStream).setRawMode(false)
  }
  process.stdin.pause()

  if (chosen === -1) {
    return { kind: exitOnCancel ? 'cancelled' : 'new' }
  }

  const row = rows[chosen]
  if (row.sessionIdx === null) {
    return { kind: 'new' }
  }

  return { kind: 'selected', session: toShow[row.sessionIdx] }
}
