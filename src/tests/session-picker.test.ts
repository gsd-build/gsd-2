import test from 'node:test'
import assert from 'node:assert/strict'

import { visLen, cell, formatDate, getLayout, COL_DATE } from '../session-picker.js'

// ── visLen ────────────────────────────────────────────────────────────────

test('visLen returns correct length for plain text', () => {
  assert.equal(visLen('hello'), 5)
  assert.equal(visLen(''), 0)
  assert.equal(visLen('abc def'), 7)
})

test('visLen strips ANSI escape codes before measuring', () => {
  const colored = '\x1B[32mhello\x1B[0m'   // chalk.green('hello')
  assert.equal(visLen(colored), 5)

  const bold = '\x1B[1mworld\x1B[0m'
  assert.equal(visLen(bold), 5)

  const combined = '\x1B[36mfoo\x1B[0m bar'
  assert.equal(visLen(combined), 7)
})

// ── cell ──────────────────────────────────────────────────────────────────

test('cell pads short text to exact width (left align)', () => {
  const result = cell('hi', 6)
  assert.equal(result, 'hi    ')
  assert.equal(result.length, 6)
})

test('cell pads short text to exact width (right align)', () => {
  const result = cell('42', 6, 'right')
  assert.equal(result, '    42')
  assert.equal(result.length, 6)
})

test('cell returns text unchanged when it exactly fits', () => {
  assert.equal(cell('hello', 5), 'hello')
})

test('cell truncates text longer than len with ellipsis', () => {
  const result = cell('hello world', 7)
  assert.equal(visLen(result), 7)
  assert.ok(result.endsWith('…'), `expected ellipsis, got: ${result}`)
})

test('cell truncates to single ellipsis when len=1', () => {
  const result = cell('hello', 1)
  assert.equal(result, '…')
})

test('cell operates on plain text — ANSI input is not expected', () => {
  // callers must strip chalk before passing to cell()
  const plain = 'session topic'
  const result = cell(plain, 7)
  assert.equal(visLen(result), 7)
  assert.ok(result.endsWith('…'))
})

// ── formatDate ────────────────────────────────────────────────────────────

test('formatDate returns a non-empty string', () => {
  const d = new Date(2026, 2, 22, 14, 30)
  const result = formatDate(d)
  assert.ok(typeof result === 'string')
  assert.ok(result.length > 0)
})

test('formatDate includes the year', () => {
  const d = new Date(2026, 2, 22, 14, 30)
  assert.ok(formatDate(d).includes('2026'))
})

// ── COL_DATE ──────────────────────────────────────────────────────────────

test('COL_DATE is at least 20 characters', () => {
  assert.ok(COL_DATE >= 20, `COL_DATE=${COL_DATE} should be >= 20`)
})

test('COL_DATE accommodates the longest possible locale date', () => {
  // Sample the same date used internally and verify COL_DATE >= its length
  const sample = formatDate(new Date(2026, 11, 31, 23, 59))
  assert.ok(
    COL_DATE >= sample.length,
    `COL_DATE=${COL_DATE} should be >= sample date length ${sample.length} ("${sample}")`,
  )
})

// ── getLayout ─────────────────────────────────────────────────────────────

test('getLayout returns useWide=false for a narrow terminal', () => {
  const { useWide } = getLayout(40)
  assert.equal(useWide, false)
})

test('getLayout returns useWide=true for a wide terminal', () => {
  const { useWide } = getLayout(200)
  assert.equal(useWide, true)
})

test('getLayout COL_TOPIC is at least 12', () => {
  const { COL_TOPIC } = getLayout(40)
  assert.ok(COL_TOPIC >= 12, `COL_TOPIC=${COL_TOPIC} should be >= 12`)
})

test('getLayout COL_TOPIC grows with terminal width', () => {
  const narrow = getLayout(100)
  const wide   = getLayout(200)
  assert.ok(
    wide.COL_TOPIC > narrow.COL_TOPIC,
    `expected wide COL_TOPIC (${wide.COL_TOPIC}) > narrow (${narrow.COL_TOPIC})`,
  )
})

test('getLayout compactWidth is at least 10', () => {
  const { compactWidth } = getLayout(10)
  assert.ok(compactWidth >= 10)
})

// ── Picker skip conditions (non-TTY / noSession) ──────────────────────────

test('runSessionPicker returns cancelled immediately when sessions list is empty', async () => {
  const { runSessionPicker } = await import('../session-picker.js')
  const result = await runSessionPicker(false, '/some/cwd', [])
  assert.equal(result.kind, 'cancelled')
})
