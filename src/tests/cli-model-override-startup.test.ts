import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const cliSource = readFileSync(join(process.cwd(), 'src', 'cli.ts'), 'utf-8')

test('cli applies --model override without awaiting provider readiness', () => {
  assert.match(
    cliSource,
    /if \(match\) \{\s*void session\.setModel\(match\)/s,
    'expected applyModelOverride to fire setModel without awaiting startup provider readiness',
  )
  assert.doesNotMatch(
    cliSource,
    /Could not apply --model override/,
    'startup path should not swallow provider readiness errors behind a warning',
  )
})

test('cli startup paths call applyModelOverride without await', () => {
  assert.match(cliSource, /\n\s*applyModelOverride\(session, modelRegistry, cliFlags\.model\)\n/s)
  assert.doesNotMatch(cliSource, /\n\s*await applyModelOverride\(session, modelRegistry, cliFlags\.model\)\n/s)
})
