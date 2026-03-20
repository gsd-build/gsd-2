---
estimated_steps: 4
estimated_files: 4
---

# T01: Build context injector and type the VerifyPolicy field

**Slice:** S05 — Context Continuity + Verification Policies
**Milestone:** M001

## Description

Establishes the two data-layer foundations S05 needs. First, defines the `VerifyPolicy` discriminated union type in `definition-loader.ts`, replacing the `unknown` type on `StepDefinition.verify`, and adds validation for all four policy shapes to `validateDefinition()`. Second, creates the pure `injectContext()` function in a new `context-injector.ts` that reads artifacts produced by prior steps and assembles them into a formatted context string for prompt injection.

Both are leaf modules — no engine or policy class dependencies. They consume `StepDefinition` types from `definition-loader.ts` and filesystem operations. This task is foundational for T02 (verification policies use the typed `VerifyPolicy`) and T03 (engine wiring calls `injectContext()`).

**Relevant skills:** None required — pure TypeScript with Node.js built-in test runner.

## Steps

1. **Add `VerifyPolicy` type to `definition-loader.ts`.**
   - Add the discriminated union type after the existing `StepDefinition` interface:
     ```typescript
     export type VerifyPolicy =
       | { policy: "content-heuristic"; minSize?: number; pattern?: string }
       | { policy: "shell-command"; command: string }
       | { policy: "prompt-verify"; prompt: string }
       | { policy: "human-review" };
     ```
   - Change `StepDefinition.verify` from `unknown` to `VerifyPolicy | undefined`.
   - In the `loadDefinition()` conversion section, the `verify: s.verify` assignment now needs a cast or pass-through since the YAML type is still `unknown` and the TypeScript type is `VerifyPolicy | undefined`. Use `as VerifyPolicy | undefined` — validation will have already run by this point (loadDefinition calls validateDefinition first).

2. **Add verify field validation to `validateDefinition()`.**
   - Inside the step validation loop, after the existing field checks, add validation for the `verify` field if present:
     - Must be an object with a `policy` string field
     - `policy` must be one of: `"content-heuristic"`, `"shell-command"`, `"prompt-verify"`, `"human-review"`
     - `shell-command` requires `command` (non-empty string)
     - `prompt-verify` requires `prompt` (non-empty string)
     - `content-heuristic` optionally has `minSize` (number) and `pattern` (string) — no required fields beyond `policy`
     - `human-review` has no required fields beyond `policy`
   - Missing `verify` field is valid (it's optional). The forward-compat test for unknown fields must still pass — `verify` being present with an unknown shape should now fail validation (it's no longer an unknown field, it's a typed field with a schema).
   - **Important:** The existing forward-compat test in `definition-loader.test.ts` passes `verify: unknown` as part of a step — but that test uses the `iterate` field as the "unknown" field, not `verify`. Check the actual test. The `verify` field IS an unknown field in the current test, but now it's a validated field. If the test has `verify` in its unknown-fields step, it must be updated to use a valid verify shape or removed from the step.

3. **Create `context-injector.ts`.**
   - New file at `src/resources/extensions/gsd/context-injector.ts`
   - Export: `injectContext(stepId: string, definition: WorkflowDefinition, runDir: string, opts?: { maxChars?: number }): string`
   - Logic:
     1. Find the step in `definition.steps` by `stepId`
     2. If step not found or `contextFrom` is undefined/empty → return `""`
     3. For each step ID in `contextFrom`:
        a. Find that step in the definition to get its `produces` array
        b. For each produces path, attempt to read `<runDir>/<path>` — skip missing files silently
        c. Assemble content with a header: `### Step: <step_name> (<step_id>)\n<content>`
     4. Wrap all content in: `## Context from prior steps\n\n<per-step blocks separated by --->\n\n---\n\n`
     5. Truncate to `opts.maxChars ?? 50000` characters. If truncated, append `\n\n[Context truncated — exceeded budget]`
     6. Return the formatted string, or `""` if no files were found
   - Import only from `definition-loader.ts` (types) and `node:fs` + `node:path`

4. **Write tests for both modules.**
   - **Add verify validation tests to `definition-loader.test.ts`:**
     - Valid content-heuristic shape → accepted
     - Valid shell-command shape → accepted
     - Valid prompt-verify shape → accepted
     - Valid human-review shape → accepted
     - Invalid policy name → rejected
     - shell-command missing `command` → rejected
     - prompt-verify missing `prompt` → rejected
     - If the existing forward-compat test includes `verify` in its unknown-fields step, update it to use a valid verify shape (since verify is now a validated field)
   - **Create `context-injector.test.ts`:**
     - Step with no `contextFrom` → returns empty string
     - Step with `contextFrom` referencing step whose artifacts exist → returns formatted content with headers
     - Missing artifact files → skipped gracefully (no error, returns empty or partial)
     - Token budget truncation → content truncated with marker
     - Multiple `contextFrom` steps → all assembled in order
     - Referenced step not in definition → skipped gracefully

## Must-Haves

- [ ] `VerifyPolicy` discriminated union exported from `definition-loader.ts` with all four policy variants
- [ ] `StepDefinition.verify` typed as `VerifyPolicy | undefined` (not `unknown`)
- [ ] `validateDefinition()` validates verify shapes — rejects invalid policies, missing required fields
- [ ] `injectContext()` returns formatted context string from prior step artifacts with headers and truncation
- [ ] All existing `definition-loader.test.ts` tests still pass (zero regressions)
- [ ] New tests for verify validation and context injection all pass
- [ ] `npx tsc --noEmit --project tsconfig.extensions.json` clean

## Verification

- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/context-injector.test.ts` — all pass
- `node --experimental-strip-types --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --test src/resources/extensions/gsd/tests/definition-loader.test.ts` — all pass (existing + new)
- `npx tsc --noEmit --project tsconfig.extensions.json` — 0 errors

## Inputs

- `src/resources/extensions/gsd/definition-loader.ts` — existing module with `StepDefinition.verify: unknown`, `validateDefinition()`, `loadDefinition()`, and `WorkflowDefinition` type
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — existing 13 tests including a forward-compat test that accepts unknown fields (may include `verify` — check before modifying)
- S04 summary: `StepDefinition.contextFrom` and `StepDefinition.verify` are already parsed from YAML and available as typed fields. No loader changes needed beyond typing verify.

## Expected Output

- `src/resources/extensions/gsd/context-injector.ts` — new pure function module (~60-80 lines)
- `src/resources/extensions/gsd/definition-loader.ts` — modified with `VerifyPolicy` type, typed `verify` field, verify validation in `validateDefinition()` (~30 lines added)
- `src/resources/extensions/gsd/tests/context-injector.test.ts` — new test file (~120-150 lines, 5-6 tests)
- `src/resources/extensions/gsd/tests/definition-loader.test.ts` — modified with 4-7 new verify validation tests
