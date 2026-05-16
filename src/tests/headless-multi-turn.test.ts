/**
 * Regression test for #3547: discuss and plan must be classified as
 * multi-turn commands in headless mode.
 *
 * Previously this test grep'd `headless.ts` for the literal identifier
 * `discuss` inside the `isMultiTurnCommand =` RHS, which would pass on a
 * comment, an unrelated string constant, or a regression that left the
 * identifier in place but stopped using it. The classifier is now an
 * exported pure function so we can call it directly.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { isMultiTurnHeadlessCommand } from '../headless.ts'

test('discuss is classified as multi-turn (#3547)', () => {
  assert.equal(isMultiTurnHeadlessCommand('discuss'), true)
})

test('plan is classified as multi-turn (#3547)', () => {
  assert.equal(isMultiTurnHeadlessCommand('plan'), true)
})

test('auto is classified as multi-turn', () => {
  assert.equal(isMultiTurnHeadlessCommand('auto'), true)
})

test('next is classified as multi-turn', () => {
  assert.equal(isMultiTurnHeadlessCommand('next'), true)
})

test('workflow is classified as multi-turn', () => {
  assert.equal(isMultiTurnHeadlessCommand('workflow'), true)
})

test('compound workflow run command is classified as multi-turn', () => {
  assert.equal(
    isMultiTurnHeadlessCommand('workflow run test-workflow --params input=demo'),
    true,
  )
})

test('compound multi-turn commands require a word boundary', () => {
  for (const cmd of ['automation', 'workflowish', 'planner', 'nextgen']) {
    assert.equal(
      isMultiTurnHeadlessCommand(cmd),
      false,
      `${cmd} should not be multi-turn`,
    )
  }
})

test('single-turn commands are not multi-turn', () => {
  for (const cmd of ['ask', 'chat', 'help', 'version', '', 'random-cmd']) {
    assert.equal(
      isMultiTurnHeadlessCommand(cmd),
      false,
      `${cmd} should not be multi-turn`,
    )
  }
})
