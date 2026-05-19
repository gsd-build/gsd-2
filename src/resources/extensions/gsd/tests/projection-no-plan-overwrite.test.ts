/**
 * Regression test for #3651 — renderAllProjections must NOT call renderPlanProjection
 *
 * renderAllProjections previously called renderPlanProjection inside the slice
 * loop, which overwrote the authoritative PLAN.md (produced by markdown-renderer.js
 * in plan-slice/replan-slice tools) with a simplified projection that was missing
 * key sections (Must-Haves, Verification, Files Likely Touched) and corrupted
 * multi-line task descriptions.
 *
 * The fix removes the renderPlanProjection call from the renderAllProjections
 * loop. The renderIfMissing recovery path is preserved.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { closeDatabase, insertMilestone, insertSlice, openDatabase } from '../gsd-db.ts'
import { renderAllProjections } from '../workflow-projections.ts'

describe('renderAllProjections must not overwrite PLAN.md (#3651)', () => {
  it('preserves authoritative PLAN.md while rendering other projections', async () => {
    const base = mkdtempSync(join(tmpdir(), 'gsd-projection-plan-'))
    const msDir = join(base, '.gsd', 'milestones', 'M001')
    const sliceDir = join(msDir, 'slices', 'S01')
    const planPath = join(sliceDir, 'S01-PLAN.md')
    const planContent = [
      '# S01 Plan',
      '',
      '## Must-Haves',
      '',
      '- preserve this authoritative section',
      '',
    ].join('\n')

    try {
      mkdirSync(sliceDir, { recursive: true })
      writeFileSync(join(msDir, 'M001-ROADMAP.md'), '# Roadmap\n\n## Slices\n\n- [ ] **S01: Slice** `risk:low` `depends:[]`\n')
      writeFileSync(planPath, planContent)
      openDatabase(join(base, '.gsd', 'gsd.db'))
      insertMilestone({ id: 'M001', title: 'Milestone', status: 'active' })
      insertSlice({ id: 'S01', milestoneId: 'M001', title: 'Slice', status: 'pending' })

      await renderAllProjections(base, 'M001')

      assert.equal(readFileSync(planPath, 'utf-8'), planContent)
      assert.ok(readFileSync(join(base, '.gsd', 'STATE.md'), 'utf-8').includes('M001'))
      assert.ok(readFileSync(join(base, '.gsd', 'ROADMAP.md'), 'utf-8').includes('M001'))
      assert.ok(readFileSync(join(base, '.gsd', 'QUEUE.md'), 'utf-8').includes('M001'))
    } finally {
      closeDatabase()
      rmSync(base, { recursive: true, force: true })
    }
  })
})
