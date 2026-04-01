import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldBlockDiscussionExecution } from '../bootstrap/write-gate.ts';

test('discussion-guard: allows all tools when discuss mode is inactive', () => {
  assert.equal(shouldBlockDiscussionExecution('write', 'src/index.ts', false).block, false);
  assert.equal(shouldBlockDiscussionExecution('edit', 'package.json', false).block, false);
  assert.equal(shouldBlockDiscussionExecution('bash', 'npm test', false).block, false);
});

test('discussion-guard: allows read-only and planning tools during discuss mode', () => {
  assert.equal(shouldBlockDiscussionExecution('read', 'src/index.ts', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('ask_user_questions', '', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('search-the-web', '', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('write', '.gsd/PROJECT.md', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('edit', '.gsd/milestones/M001/M001-CONTEXT.md', true).block, false);
});

test('discussion-guard: blocks source file mutations during discuss mode', () => {
  const writeResult = shouldBlockDiscussionExecution('write', 'src/index.ts', true);
  assert.equal(writeResult.block, true);
  assert.match(writeResult.reason ?? '', /planning workflow/i);

  const editResult = shouldBlockDiscussionExecution('edit', '/project/package.json', true);
  assert.equal(editResult.block, true);
  assert.match(editResult.reason ?? '', /before modifying project files/i);
});

test('discussion-guard: blocks mutating bash commands during discuss mode', () => {
  const result = shouldBlockDiscussionExecution('bash', 'npm install some-package', true);
  assert.equal(result.block, true);
  assert.match(result.reason ?? '', /implementation commands/i);
});

test('discussion-guard: allows read-only bash commands during discuss mode', () => {
  assert.equal(shouldBlockDiscussionExecution('bash', 'cat src/index.ts', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('bash', 'git diff HEAD~1', true).block, false);
  assert.equal(shouldBlockDiscussionExecution('bash', 'mkdir -p .gsd/milestones/M001/slices', true).block, false);
});
