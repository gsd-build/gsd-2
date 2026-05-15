// GSD Extension — Plan-slice tool integration tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, existsSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { openDatabase, closeDatabase, insertMilestone, insertSlice, getSlice, getSliceTasks, getTask, getGateResults, updateTaskStatus } from '../gsd-db.ts';
import { handlePlanSlice } from '../tools/plan-slice.ts';
import { parsePlan } from '../parsers-legacy.ts';
import { parseTaskPlanFile } from '../files.ts';
import { deriveState, invalidateStateCache } from '../state.ts';

function makeTmpBase(): string {
  const base = mkdtempSync(join(tmpdir(), 'gsd-plan-slice-'));
  mkdirSync(join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'tasks'), { recursive: true });
  mkdirSync(join(base, 'src', 'resources', 'extensions', 'gsd', 'tools'), { recursive: true });
  writeFileSync(join(base, 'src', 'resources', 'extensions', 'gsd', 'tools', 'plan-milestone.ts'), '// fixture\n', 'utf-8');
  writeFileSync(join(base, 'src', 'resources', 'extensions', 'gsd', 'tools', 'plan-task.ts'), '// fixture\n', 'utf-8');
  writeFileSync(join(base, 'stale-input.py'), '# fixture\n', 'utf-8');
  return base;
}

function cleanup(base: string): void {
  try { closeDatabase(); } catch { /* noop */ }
  try { rmSync(base, { recursive: true, force: true }); } catch { /* noop */ }
}

function seedParentSlice(): void {
  insertMilestone({ id: 'M001', title: 'Milestone', status: 'active' });
  insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Planning slice', status: 'pending', demo: 'Rendered plans exist.' });
}

function validParams() {
  return {
    milestoneId: 'M001',
    sliceId: 'S02',
    goal: 'Persist slice planning through the DB.',
    successCriteria: '- Slice plan renders from DB\n- Task plan files are regenerated',
    proofLevel: 'integration',
    integrationClosure: 'Planning handlers now write DB rows and render plan artifacts.',
    observabilityImpact: '- Validation failures return structured errors\n- Cache invalidation is proven by parse-visible state updates',
    tasks: [
      {
        taskId: 'T01',
        title: 'Write slice handler',
        description: 'Implement the slice planning handler.',
        estimate: '45m',
        files: ['src/resources/extensions/gsd/tools/plan-slice.ts'],
        verify: 'node --test src/resources/extensions/gsd/tests/plan-slice.test.ts',
        inputs: ['src/resources/extensions/gsd/tools/plan-milestone.ts'],
        expectedOutput: ['src/resources/extensions/gsd/tools/plan-slice.ts'],
        observabilityImpact: 'Tests exercise cache invalidation and render failure paths.',
      },
      {
        taskId: 'T02',
        title: 'Write task handler',
        description: 'Implement the task planning handler.',
        estimate: '30m',
        files: ['src/resources/extensions/gsd/tools/plan-task.ts'],
        verify: 'node --test src/resources/extensions/gsd/tests/plan-task.test.ts',
        inputs: ['src/resources/extensions/gsd/tools/plan-task.ts'],
        expectedOutput: ['src/resources/extensions/gsd/tests/plan-task.test.ts'],
        observabilityImpact: 'Task-plan renders remain parse-compatible.',
      },
    ],
  };
}

test('handlePlanSlice writes slice/task planning state and renders plan artifacts', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();

    const result = await handlePlanSlice(validParams(), base);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

    const slice = getSlice('M001', 'S02');
    assert.ok(slice);
    assert.equal(slice?.goal, 'Persist slice planning through the DB.');
    assert.equal(slice?.proof_level, 'integration');

    const tasks = getSliceTasks('M001', 'S02');
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0]?.title, 'Write slice handler');
    assert.equal(tasks[0]?.description, 'Implement the slice planning handler.');
    assert.equal(tasks[1]?.estimate, '30m');
    assert.deepEqual(slice?.target_repositories, ['project']);
    assert.deepEqual(tasks[0]?.target_repositories, ['project']);

    const planPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md');
    assert.ok(existsSync(planPath), 'slice plan should be rendered to disk');
    const parsedPlan = parsePlan(readFileSync(planPath, 'utf-8'));
    assert.equal(parsedPlan.goal, 'Persist slice planning through the DB.');
    assert.equal(parsedPlan.tasks.length, 2);
    assert.equal(parsedPlan.tasks[0]?.id, 'T01');

    const taskPlanPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'tasks', 'T01-PLAN.md');
    assert.ok(existsSync(taskPlanPath), 'task plan should be rendered to disk');
    const taskPlan = parseTaskPlanFile(readFileSync(taskPlanPath, 'utf-8'));
    assert.deepEqual(taskPlan.frontmatter.skills_used, []);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice persists explicit slice/task target repositories', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const params = validParams();
    const result = await handlePlanSlice({
      ...params,
      targetRepositories: ['project'],
      tasks: [
        { ...params.tasks[0], targetRepositories: ['project'] },
        { ...params.tasks[1], targetRepositories: ['project'] },
      ],
    }, base);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

    const slice = getSlice('M001', 'S02');
    const task = getTask('M001', 'S02', 'T01');
    assert.deepEqual(slice?.target_repositories, ['project']);
    assert.deepEqual(task?.target_repositories, ['project']);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects unknown target repositories', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const result = await handlePlanSlice({
      ...validParams(),
      targetRepositories: ['frontend'],
    }, base);
    assert.ok('error' in result);
    assert.match(result.error, /validation failed: unknown targetRepositories:/);
    assert.equal(getSliceTasks('M001', 'S02').length, 0, 'invalid target repositories must not persist');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice enforces absolute path scope to declared target repositories', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    mkdirSync(join(base, 'frontend'), { recursive: true });
    mkdirSync(join(base, 'backend'), { recursive: true });
    writeFileSync(
      join(base, '.gsd', 'PREFERENCES.md'),
      [
        '---',
        'workspace:',
        '  mode: parent',
        '  repositories:',
        '    frontend:',
        '      path: frontend',
        '    backend:',
        '      path: backend',
        '---',
      ].join('\n'),
      'utf-8',
    );

    const badPath = join(base, 'backend', 'src', 'server.ts');
    const result = await handlePlanSlice({
      ...validParams(),
      targetRepositories: ['frontend'],
      tasks: [
        {
          ...validParams().tasks[0],
          files: [badPath],
          targetRepositories: ['frontend'],
        },
      ],
    }, base);

    assert.ok('error' in result);
    assert.match(result.error, /outside allowed repository roots/);
    assert.equal(getSliceTasks('M001', 'S02').length, 0, 'invalid scoped path must not persist');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice renders plan artifacts under worktree-local .gsd while using project DB', async () => {
  const base = makeTmpBase();
  const worktree = join(base, '.gsd', 'worktrees', 'M001');
  mkdirSync(join(worktree, '.gsd'), { recursive: true });
  mkdirSync(join(worktree, 'src', 'resources', 'extensions', 'gsd', 'tools'), { recursive: true });
  writeFileSync(join(worktree, 'src', 'resources', 'extensions', 'gsd', 'tools', 'plan-milestone.ts'), '// fixture\n', 'utf-8');
  writeFileSync(join(worktree, 'src', 'resources', 'extensions', 'gsd', 'tools', 'plan-task.ts'), '// fixture\n', 'utf-8');
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();

    const result = await handlePlanSlice(validParams(), worktree);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

    const worktreePlan = join(worktree, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md');
    const projectPlan = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md');
    assert.ok(existsSync(worktreePlan), 'slice plan should be rendered to worktree-local .gsd');
    assert.ok(!existsSync(projectPlan), 'slice plan should not be rendered to project .gsd');
    assert.equal(result.planPath, realpathSync(worktreePlan));
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice advances DB-derived state out of planning immediately', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();

    invalidateStateCache();
    const before = await deriveState(base);
    assert.equal(before.phase, 'planning');
    assert.equal(before.progress?.tasks?.total, 0);

    const result = await handlePlanSlice(validParams(), base);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

    invalidateStateCache();
    const after = await deriveState(base);
    assert.notEqual(after.phase, 'planning');
    assert.equal(after.progress?.tasks?.total, 2);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice clears sketch flag so DB-derived state leaves refining', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    insertMilestone({ id: 'M001', title: 'Milestone', status: 'active' });
    insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Planning slice', status: 'pending', demo: 'Rendered plans exist.', isSketch: true });

    invalidateStateCache();
    const before = await deriveState(base);
    assert.equal(before.phase, 'refining');

    const result = await handlePlanSlice(validParams(), base);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);
    assert.equal(getSlice('M001', 'S02')?.is_sketch, 0, 'planned slice must no longer be treated as a sketch');

    invalidateStateCache();
    const after = await deriveState(base);
    assert.notEqual(after.phase, 'refining');
    assert.equal(after.progress?.tasks?.total, 2);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice leaves omitted enrichment fields empty instead of rendering placeholders', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const { successCriteria, proofLevel, integrationClosure, observabilityImpact, ...params } = validParams();
    void successCriteria;
    void proofLevel;
    void integrationClosure;
    void observabilityImpact;

    const result = await handlePlanSlice(params, base);
    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

    const slice = getSlice('M001', 'S02');
    assert.ok(slice);
    assert.equal(slice?.success_criteria, '');
    assert.equal(slice?.proof_level, '');
    assert.equal(slice?.integration_closure, '');
    assert.equal(slice?.observability_impact, '');

    const planPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md');
    const content = readFileSync(planPath, 'utf-8');
    assert.doesNotMatch(content, /Not provided/i);
    assert.doesNotMatch(content, /^## Proof Level$/m);
    assert.doesNotMatch(content, /^## Integration Closure$/m);
    assert.match(content, /- Complete the planned slice outcomes\./);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects invalid payloads', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const result = await handlePlanSlice({ ...validParams(), tasks: [] }, base);
    assert.ok('error' in result);
    assert.match(result.error, /validation failed: tasks must be a non-empty array/);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice explains string task IO fields must be arrays', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const result = await handlePlanSlice({
      ...validParams(),
      tasks: [
        {
          ...validParams().tasks[0],
          inputs: 'src/index.ts' as unknown as string[],
        },
      ],
    }, base);
    assert.ok('error' in result);
    assert.match(result.error, /validation failed: tasks\[0\]\.inputs must be an array of strings, not string/);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects absolute task IO paths outside the active worktree', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const outside = join(tmpdir(), 'outside-checkout', 'index.html');
    const result = await handlePlanSlice({
      ...validParams(),
      tasks: [
        {
          ...validParams().tasks[0],
          inputs: [outside],
          expectedOutput: [outside],
        },
      ],
    }, base);

    assert.ok('error' in result);
    assert.match(result.error, /validation failed: tasks\[0\]\.inputs contains absolute path outside allowed repository roots/);
    assert.equal(getSliceTasks('M001', 'S02').length, 0, 'invalid planning IO must not persist tasks');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects missing task input paths before persisting tasks', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const result = await handlePlanSlice({
      ...validParams(),
      tasks: [
        {
          ...validParams().tasks[0],
          inputs: ['fixtures/missing-source.json'],
        },
      ],
    }, base);

    assert.ok('error' in result);
    assert.match(result.error, /pre-execution validation failed:/);
    assert.match(result.error, /fixtures\/missing-source\.json/);
    assert.equal(getSliceTasks('M001', 'S02').length, 0, 'invalid planning IO must not persist tasks');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects task input paths created by later tasks before persisting tasks', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const params = validParams();
    const result = await handlePlanSlice({
      ...params,
      tasks: [
        {
          ...params.tasks[0],
          inputs: ['generated/report.json'],
          expectedOutput: ['generated/summary.json'],
        },
        {
          ...params.tasks[1],
          inputs: [],
          expectedOutput: ['generated/report.json'],
        },
      ],
    }, base);

    assert.ok('error' in result);
    assert.match(result.error, /pre-execution validation failed:/);
    assert.match(result.error, /sequence violation/);
    assert.equal(getSliceTasks('M001', 'S02').length, 0, 'invalid task ordering must not persist tasks');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice accepts absolute task IO paths inside the active worktree', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const inside = join(base, 'index.html');
    const result = await handlePlanSlice({
      ...validParams(),
      tasks: [
        {
          ...validParams().tasks[0],
          inputs: [inside],
          expectedOutput: [inside],
        },
      ],
    }, base);

    assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects missing parent slice', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    insertMilestone({ id: 'M001', title: 'Milestone', status: 'active' });
    const result = await handlePlanSlice(validParams(), base);
    assert.ok('error' in result);
    assert.match(result.error, /missing parent slice: M001\/S02/);
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice surfaces render failures without changing parse-visible task-plan state for the failing task', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const failingTaskPlanPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'tasks', 'T01-PLAN.md');
    writeFileSync(failingTaskPlanPath, '---\nestimated_steps: 1\nestimated_files: 1\nskills_used: []\n---\n\n# T01: Cached task\n', 'utf-8');
    rmSync(failingTaskPlanPath, { force: true });
    mkdirSync(failingTaskPlanPath, { recursive: true });

    const result = await handlePlanSlice(validParams(), base);
    assert.ok('error' in result);
    assert.match(result.error, /render failed:/);

    assert.ok(existsSync(failingTaskPlanPath), 'failing task plan path should remain the blocking directory');
    assert.equal(getTask('M001', 'S02', 'T01')?.description, 'Implement the slice planning handler.');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice reactivates a deferred parent slice to pending', async (t) => {
  const base = makeTmpBase();
  t.after(() => cleanup(base));
  openDatabase(join(base, '.gsd', 'gsd.db'));

  insertMilestone({ id: 'M001', title: 'Milestone', status: 'active' });
  insertSlice({ id: 'S02', milestoneId: 'M001', title: 'Planning slice', status: 'deferred', demo: 'Rendered plans exist.' });

  const result = await handlePlanSlice(validParams(), base);
  assert.ok(!('error' in result), `unexpected error: ${'error' in result ? result.error : ''}`);

  const slice = getSlice('M001', 'S02');
  assert.ok(slice);
  assert.equal(slice?.status, 'pending', 'deferred slice must be reactivated to pending so auto-mode can dispatch it');
  assert.equal(slice?.goal, 'Persist slice planning through the DB.');
});

test('handlePlanSlice reruns idempotently and refreshes parse-visible state', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    writeFileSync(join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md'), '# S02: Cached\n\n**Goal:** old value\n\n## Tasks\n\n- [ ] **T01: Cached task**\n', 'utf-8');

    const first = await handlePlanSlice(validParams(), base);
    assert.ok(!('error' in first));

    const second = await handlePlanSlice({
      ...validParams(),
      goal: 'Updated goal from rerun.',
      tasks: [
        { ...validParams().tasks[0], description: 'Updated slice handler description.' },
        validParams().tasks[1],
      ],
    }, base);
    assert.ok(!('error' in second));

    const parsedAfter = parsePlan(readFileSync(join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'S02-PLAN.md'), 'utf-8'));
    assert.equal(parsedAfter.goal, 'Updated goal from rerun.');
    const task = getTask('M001', 'S02', 'T01');
    assert.equal(task?.description, 'Updated slice handler description.');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice removes omitted pending tasks when replanning a smaller task set', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const fourTaskPlan = {
      ...validParams(),
      tasks: [
        ...validParams().tasks,
        { ...validParams().tasks[0], taskId: 'T03', title: 'Third task' },
        { ...validParams().tasks[0], taskId: 'T04', title: 'Stale task', inputs: ['stale-input.py'] },
      ],
    };

    const first = await handlePlanSlice(fourTaskPlan, base);
    assert.ok(!('error' in first), `unexpected error: ${'error' in first ? first.error : ''}`);
    const staleTaskPlanPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'tasks', 'T04-PLAN.md');
    assert.ok(existsSync(staleTaskPlanPath), 'initial plan should render T04');

    const second = await handlePlanSlice({
      ...validParams(),
      tasks: fourTaskPlan.tasks.filter((task) => task.taskId !== 'T04'),
    }, base);
    assert.ok(!('error' in second), `unexpected error: ${'error' in second ? second.error : ''}`);

    assert.deepEqual(getSliceTasks('M001', 'S02').map((task) => task.id), ['T01', 'T02', 'T03']);
    assert.equal(getGateResults('M001', 'S02', 'task').some((gate) => gate.task_id === 'T04'), false);
    assert.equal(existsSync(staleTaskPlanPath), false, 'omitted task plan artifact should be removed');
  } finally {
    cleanup(base);
  }
});

test('handlePlanSlice rejects omitted completed tasks without changing slice or task state', async () => {
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();
    const fourTaskPlan = {
      ...validParams(),
      tasks: [
        ...validParams().tasks,
        { ...validParams().tasks[0], taskId: 'T03', title: 'Third task' },
        { ...validParams().tasks[0], taskId: 'T04', title: 'Stale task', inputs: ['stale-input.py'] },
      ],
    };

    const first = await handlePlanSlice(fourTaskPlan, base);
    assert.ok(!('error' in first), `unexpected error: ${'error' in first ? first.error : ''}`);
    const staleTaskPlanPath = join(base, '.gsd', 'milestones', 'M001', 'slices', 'S02', 'tasks', 'T04-PLAN.md');
    assert.ok(existsSync(staleTaskPlanPath), 'initial plan should render T04');

    updateTaskStatus('M001', 'S02', 'T04', 'complete', '2026-05-12T00:00:00.000Z');
    const tasksBefore = getSliceTasks('M001', 'S02');
    const gatesBefore = getGateResults('M001', 'S02', 'task');

    const second = await handlePlanSlice({
      ...validParams(),
      goal: 'Rejected replan should not persist.',
      tasks: fourTaskPlan.tasks.filter((task) => task.taskId !== 'T04'),
    }, base);
    assert.deepEqual(second, { error: 'cannot remove completed task T04' });

    assert.equal(getSlice('M001', 'S02')?.goal, 'Persist slice planning through the DB.');
    assert.deepEqual(getSliceTasks('M001', 'S02'), tasksBefore);
    assert.deepEqual(getGateResults('M001', 'S02', 'task'), gatesBefore);
    assert.ok(existsSync(staleTaskPlanPath), 'completed task plan artifact should remain after rejected replan');
  } finally {
    cleanup(base);
  }
});

test('regression: validateTasks surfaces clean per-field errors for non-array IO inputs', async () => {
  // Regression for the bug fixed in PR #5872: an earlier refactor on main
  // (0b0e1a901) re-added validateStringArray() calls inside validateTasks
  // without re-adding its import. The catch around validateParams swallowed
  // the ReferenceError into a generic "validation failed: validateStringArray
  // is not defined" message, so silent runtime breakage was possible.
  //
  // Exercise every validateStringArray call site (files, inputs, expectedOutput)
  // so a future missing-import would surface as a per-field assertion failure
  // here, not a deep ReferenceError that's easy to mis-diagnose.
  const base = makeTmpBase();
  openDatabase(join(base, '.gsd', 'gsd.db'));

  try {
    seedParentSlice();

    for (const field of ['files', 'inputs', 'expectedOutput'] as const) {
      const result = await handlePlanSlice({
        ...validParams(),
        tasks: [{
          ...validParams().tasks[0],
          [field]: 'not-an-array' as unknown as string[],
        }],
      }, base);
      assert.ok('error' in result, `${field}: expected validation error, got success`);
      assert.match(
        result.error,
        new RegExp(`tasks\\[0\\]\\.${field} must be an array`),
        `${field}: expected per-field validation message, got: ${result.error}`,
      );
      assert.doesNotMatch(
        result.error,
        /is not defined/,
        `${field}: validation surfaced ReferenceError — likely a missing import in plan-slice.ts`,
      );
      assert.equal(getSliceTasks('M001', 'S02').length, 0, `${field}: invalid input must not persist`);
    }
  } finally {
    cleanup(base);
  }
});
