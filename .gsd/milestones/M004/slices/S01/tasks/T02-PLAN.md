---
estimated_steps: 2
estimated_files: 1
---

# T02: Add non-null assertion for default model

**Slice:** S01 — CI Failure Fix and Verification
**Milestone:** M004

## Description

After T01 populates the registry, the default model "gemini-2.5-flash-lite-preview-06-17" is guaranteed to exist in the snapshot. This task adds a non-null assertion to the assignment in `agent.ts` to satisfy TypeScript's type checker.

## Steps

1. Open `packages/pi-agent-core/src/agent.ts` and locate line 105 (the default model assignment)
2. Add the non-null assertion operator (`!`) to the assignment, changing from `getModel(...)` to `getModel(...)!`

## Must-Haves

- [ ] Non-null assertion added to default model assignment
- [ ] No change to the model ID string itself
- [ ] TypeScript error is resolved

## Verification

- `npm run build -w @gsd/pi-agent-core` succeeds without TypeScript errors
- The build output shows no type errors for `agent.ts`

## Observability Impact

None — this is a type-level change only.

## Inputs

- `packages/pi-agent-core/src/agent.ts` — current file with type error on line 105

## Expected Output

- `packages/pi-agent-core/src/agent.ts` — modified with non-null assertion on default model assignment
