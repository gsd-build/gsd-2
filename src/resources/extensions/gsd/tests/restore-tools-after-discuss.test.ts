/**
 * Regression test for #3628 — restore tool set after discuss flow scoping
 *
 * The discuss flow narrows the active tool set to avoid "grammar too complex"
 * errors. Without restoring after sendMessage, the narrowed tools leaked into
 * subsequent dispatches, breaking plan/execute flows.
 *
 * The fix saves the full tool set before scoping and restores it after
 * sendMessage returns.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractSourceRegion } from "./test-helpers.ts";

const src = readFileSync(
  resolve(process.cwd(), 'src', 'resources', 'extensions', 'gsd', 'guided-flow.ts'),
  'utf-8',
)

describe('restore tools after discuss flow scoping (#3628)', () => {
  it('savedTools is declared before the discuss scoping block', () => {
    // savedTools must be declared before the discuss-* check
    const savedToolsDecl = src.indexOf('let savedTools')
    const discussCheck = src.indexOf('if (unitType?.startsWith("discuss-")')
    assert.ok(savedToolsDecl !== -1, 'savedTools variable must be declared')
    assert.ok(discussCheck !== -1, 'discuss-* type check must exist')
    assert.ok(
      savedToolsDecl < discussCheck,
      'savedTools must be declared before the discuss scoping block',
    )
  })

  it('savedTools captures current tools before scoping can mutate active state', () => {
    const discussCheck = src.indexOf('if (unitType?.startsWith("discuss-")')
    assert.ok(discussCheck !== -1)

    const currentToolsDecl = src.indexOf('const currentTools = pi.getActiveTools()')
    const savedToolsAssign = src.indexOf('savedTools = {', currentToolsDecl)
    const firstMutation = src.indexOf('pi.setActiveTools(scopedTools)')
    assert.ok(
      currentToolsDecl !== -1 && savedToolsAssign !== -1 && firstMutation !== -1,
      'guided-flow.ts must capture current tools, save them, and then scope active tools',
    )
    assert.ok(
      currentToolsDecl < savedToolsAssign && savedToolsAssign < firstMutation,
      'savedTools must capture currentTools before any discuss scoping mutation',
    )
    assert.ok(
      src.slice(savedToolsAssign, firstMutation).includes('tools: currentTools'),
      'savedTools must include currentTools before the first scoping mutation',
    )
  })

  it('scoping and workflow read happen inside the restore try block', () => {
    const savedToolsDecl = src.indexOf('let savedTools')
    const tryIdx = src.indexOf('try {', savedToolsDecl)
    const firstMutation = src.indexOf('pi.setActiveTools(scopedTools)')
    const workflowRead = src.indexOf('readFileSync(workflowPath')
    const finallyIdx = src.indexOf('} finally {', tryIdx)

    assert.ok(savedToolsDecl !== -1, 'savedTools variable must be declared')
    assert.ok(tryIdx !== -1, 'restore try block must exist')
    assert.ok(firstMutation !== -1, 'discuss scoping mutation must exist')
    assert.ok(workflowRead !== -1, 'workflow file read must exist')
    assert.ok(finallyIdx !== -1, 'restore finally block must exist')
    assert.ok(tryIdx < firstMutation && firstMutation < finallyIdx, 'scoping mutation must be inside try/finally')
    assert.ok(tryIdx < workflowRead && workflowRead < finallyIdx, 'workflow file read must be inside try/finally')
  })

  it('savedTools is restored after sendMessage', () => {
    // #4573: guided-flow.ts now contains multiple `triggerTurn: true` calls
    // (ready-phrase and empty-turn recovery paths). The discuss-flow scoping
    // sendMessage is the one that follows `tools: currentTools`, so
    // anchor the search there rather than at the first `triggerTurn: true`.
    const savedToolsAssign = src.indexOf('tools: currentTools')
    assert.ok(savedToolsAssign !== -1, 'savedTools must capture currentTools')

    const sendMsg = src.indexOf('triggerTurn: true', savedToolsAssign)
    assert.ok(sendMsg !== -1, 'discuss-flow sendMessage with triggerTurn must exist after savedTools capture')

    // After sendMessage, savedTools should be restored via the shared helper.
    // Use fromIdx to anchor at the discuss-flow sendMessage, not the first
    // triggerTurn: true occurrence in the file.
    const afterSend = extractSourceRegion(src, 'triggerTurn: true', { fromIdx: savedToolsAssign })
    assert.ok(
      afterSend.includes('restoreGsdWorkflowTools(pi, savedTools)'),
      'restoreGsdWorkflowTools(pi, savedTools) must restore the full scoped state',
    )
  })
})
