/**
 * Regression test for DB-authoritative syncWorktreeStateBack behavior.
 *
 * Worktree milestone projections are not authoritative. syncWorktreeStateBack
 * may reconcile a legacy worktree DB and copy diagnostics, but must not copy
 * milestone markdown directories back into the project root.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractSourceRegion } from "./test-helpers.ts";

const src = readFileSync(
  resolve(process.cwd(), 'src', 'resources', 'extensions', 'gsd', 'auto-worktree.ts'),
  'utf-8',
)

describe('syncWorktreeStateBack does not copy worktree milestone projections', () => {
  it('syncWorktreeStateBack function exists', () => {
    assert.ok(
      src.includes('function syncWorktreeStateBack('),
      'syncWorktreeStateBack function must be defined',
    )
  })

  it('does not iterate worktree milestones for copy-back', () => {
    // Find syncWorktreeStateBack
    const fnStart = src.indexOf('function syncWorktreeStateBack(')
    assert.ok(fnStart !== -1)

    // Get a reasonable portion of the function
    const fnBlock = extractSourceRegion(src, 'function syncWorktreeStateBack(', { fromIdx: fnStart })

    assert.ok(!fnBlock.includes('for (const mid of wtMilestones)'), 'must not iterate worktree milestones')
    assert.ok(!fnBlock.includes('syncMilestoneDir('), 'must not copy milestone markdown projections')
  })

  it('legacy milestone copy helper has been removed', () => {
    assert.ok(!src.includes('function syncMilestoneDir('), 'syncMilestoneDir helper should not exist')
  })
})
