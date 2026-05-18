/**
 * Regression test for #3626 / #3649 — pre-execution-checks false positives
 *
 * Two sources of false positives were fixed:
 *   1. normalizeFilePath did not strip backtick wrapping from LLM-generated
 *      paths like `src/foo.ts`, causing file-existence checks to fail (#3649).
 *   2. checkFilePathConsistency checked both task.files and task.inputs, but
 *      task.files ("files likely touched") intentionally includes files that
 *      will be created by the task, so they don't need to pre-exist (#3626).
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeFilePath, checkFilePathConsistency } from '../pre-execution-checks.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('normalizeFilePath backtick stripping (#3649)', () => {
  it('strips backticks from file paths', () => {
    assert.equal(normalizeFilePath('`src/foo.ts`'), 'src/foo.ts')
  })

  it('strips doubled backticks and trailing notes from file paths', () => {
    assert.equal(normalizeFilePath('``src/foo.ts`` - current state'), 'src/foo.ts')
    assert.equal(normalizeFilePath('``src/foo.ts`` (current state)'), 'src/foo.ts')
  })

  it('strips annotation text inside a single backtick pair (#5566)', () => {
    assert.equal(
      normalizeFilePath('`monitoring/services/url_validator.py (new file — no prior inputs)`'),
      'monitoring/services/url_validator.py',
    )
  })

  it('strips dash-style annotation text inside a single backtick pair (#5566)', () => {
    assert.equal(
      normalizeFilePath('`src/foo.ts — current state`'),
      'src/foo.ts',
    )
  })

  it('strips stray backticks from dash-annotated bare paths (#4550)', () => {
    assert.equal(
      normalizeFilePath('.gsd/KNOWLEDGE.md` — append-only S05 lessons section'),
      '.gsd/KNOWLEDGE.md',
    )
  })

  it('prefers a backticked path inside a dash-annotated prefix (#4550)', () => {
    assert.equal(
      normalizeFilePath('Input `src/foo.ts` — current state'),
      'src/foo.ts',
    )
  })

  it('strips backticks even when mixed with other normalization', () => {
    assert.equal(normalizeFilePath('`./src//bar.ts`'), 'src/bar.ts')
  })

  it('leaves normal paths unchanged', () => {
    assert.equal(normalizeFilePath('src/foo.ts'), 'src/foo.ts')
  })

  it('handles empty string', () => {
    assert.equal(normalizeFilePath(''), '')
  })
})

describe('checkFilePathConsistency checks task.inputs not task.files (#3626)', () => {
  it('ignores missing task.files entries that are only likely outputs', () => {
    const task = {
      milestone_id: 'M001',
      slice_id: 'S01',
      id: 'T01',
      title: 'Create missing file',
      status: 'pending',
      one_liner: '',
      narrative: '',
      verification_result: '',
      duration: '',
      completed_at: null,
      blocker_discovered: false,
      deviations: '',
      known_issues: '',
      key_files: [],
      key_decisions: [],
      full_summary_md: '',
      description: '',
      estimate: '',
      files: ['src/new-file.ts'],
      verify: '',
      inputs: [],
      expected_output: ['src/new-file.ts'],
      observability_impact: '',
      full_plan_md: '',
      sequence: 0,
    }

    const tmp = resolve(process.cwd(), '.tmp-pre-exec-files-ignore')
    try {
      mkdirSync(tmp, { recursive: true })
      assert.deepEqual(checkFilePathConsistency([task as any], tmp), [])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('checkFilePathConsistency handles doubled-backtick annotations (#3892)', () => {
  it('accepts existing files when task.inputs include doubled-backtick notes', () => {
    const task = {
      milestone_id: 'M001',
      slice_id: 'S01',
      id: 'T01',
      title: 'Test Task',
      status: 'pending',
      one_liner: '',
      narrative: '',
      verification_result: '',
      duration: '',
      completed_at: null,
      blocker_discovered: false,
      deviations: '',
      known_issues: '',
      key_files: [],
      key_decisions: [],
      full_summary_md: '',
      description: '',
      estimate: '',
      files: [],
      verify: '',
      inputs: ['``src/foo.ts`` (current state)'],
      expected_output: [],
      observability_impact: '',
      full_plan_md: '',
      sequence: 0,
    }

    const tmp = resolve(process.cwd(), '.tmp-pre-exec-3892')
    try {
      mkdirSync(resolve(tmp, 'src'), { recursive: true })
      writeFileSync(resolve(tmp, 'src', 'foo.ts'), '// ok')
      const results = checkFilePathConsistency([task as any], tmp)
      assert.deepEqual(results, [])
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
