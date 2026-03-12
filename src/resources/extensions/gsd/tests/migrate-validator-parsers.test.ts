// Unit tests for T02: validator and per-file parsers
// Tests these independently of the T03 orchestrator (parsePlanningDirectory).

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validatePlanningDirectory } from '../migrate/validator.ts';
import {
  parseOldRoadmap,
  parseOldPlan,
  parseOldSummary,
  parseOldRequirements,
  parseOldProject,
  parseOldState,
  parseOldConfig,
} from '../migrate/parsers.ts';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function createFixtureBase(): string {
  return mkdtempSync(join(tmpdir(), 'gsd-migrate-t02-'));
}
function createPlanningDir(base: string): string {
  const dir = join(base, '.planning');
  mkdirSync(dir, { recursive: true });
  return dir;
}
function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

// ─── Sample Fixtures ───────────────────────────────────────────────────────

const SAMPLE_ROADMAP = `# Project Roadmap

## Phases

- [x] 29 — Auth System
- [ ] 30 — Dashboard
- [ ] 31 — Notifications
`;

const SAMPLE_PROJECT = `# My Project

A sample project for testing the migration parser.
`;

const SAMPLE_MILESTONE_SECTIONED_ROADMAP = `# Project Roadmap

## v2.0 — Foundation

<details>
<summary>Completed</summary>

- [x] 01 — Project Setup
- [x] 02 — Database Schema

</details>

## v2.5 — Features

- [x] 29 — Auth System
- [ ] 30 — Dashboard
- [ ] 31 — Notifications
`;

const SAMPLE_PLAN_XML = `---
phase: "29-auth-system"
plan: "01"
type: "implementation"
wave: 1
depends_on: []
files_modified: [src/auth.ts, src/login.ts]
autonomous: true
must_haves:
  truths:
    - Users can log in
  artifacts:
    - src/auth.ts
  key_links: []
---

# 29-01: Implement Auth

<objective>
Build the authentication system with JWT tokens and session management.
</objective>

<tasks>
<task>Create auth middleware</task>
<task>Add login endpoint</task>
<task>Add logout endpoint</task>
</tasks>

<context>
The project needs authentication before any other features can be built.
Auth tokens use JWT with RS256 signing.
</context>

<verification>
- Login returns valid JWT
- Middleware rejects invalid tokens
- Logout invalidates session
</verification>

<success_criteria>
All auth endpoints respond correctly and tokens are validated.
</success_criteria>
`;

const SAMPLE_SUMMARY = `---
phase: "29-auth-system"
plan: "01"
subsystem: "auth"
tags:
  - authentication
  - security
requires: []
provides:
  - auth-middleware
  - jwt-validation
affects:
  - api-routes
tech-stack:
  - jsonwebtoken
  - express
key-files:
  - src/auth.ts
  - src/middleware/auth.ts
key-decisions:
  - Use RS256 for JWT signing
  - Store refresh tokens in DB
patterns-established:
  - Middleware-based auth
duration: "2h"
completed: "2026-01-15"
---

# 29-01: Auth Implementation Summary

Authentication system implemented with JWT tokens.
`;

const SAMPLE_REQUIREMENTS = `# Requirements

## Active

### R001 — User Authentication
- Status: active
- Description: Users must be able to log in.

### R002 — Dashboard View
- Status: active
- Description: Main dashboard page.

## Validated

### R003 — Session Management
- Status: validated
- Description: Sessions expire after 24h.

## Deferred

### R004 — OAuth Support
- Status: deferred
- Description: Third-party login.
`;

const SAMPLE_STATE = `# State

**Current Phase:** 30-dashboard
**Status:** in-progress
`;

async function main(): Promise<void> {

  // ═══════════════════════════════════════════════════════════════════════
  // Validator Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Validator: missing directory → fatal ===');
  {
    const base = createFixtureBase();
    try {
      const result = await validatePlanningDirectory(join(base, 'nonexistent'));
      assertEq(result.valid, false, 'missing dir: validation fails');
      assert(result.issues.length > 0, 'missing dir: has issues');
      assert(result.issues.some(i => i.severity === 'fatal'), 'missing dir: has fatal issue');
    } finally {
      cleanup(base);
    }
  }

  console.log('\n=== Validator: missing ROADMAP.md → warning (not fatal) ===');
  {
    const base = createFixtureBase();
    try {
      const planning = createPlanningDir(base);
      writeFileSync(join(planning, 'PROJECT.md'), SAMPLE_PROJECT);
      const result = await validatePlanningDirectory(planning);
      assertEq(result.valid, true, 'no roadmap: validation still passes');
      assert(result.issues.some(i => i.severity === 'warning' && i.file.includes('ROADMAP')), 'no roadmap: warning issue mentions ROADMAP');
    } finally {
      cleanup(base);
    }
  }

  console.log('\n=== Validator: missing PROJECT.md → warning ===');
  {
    const base = createFixtureBase();
    try {
      const planning = createPlanningDir(base);
      writeFileSync(join(planning, 'ROADMAP.md'), SAMPLE_ROADMAP);
      const result = await validatePlanningDirectory(planning);
      assertEq(result.valid, true, 'no project: validation passes (warning only)');
      assert(result.issues.some(i => i.severity === 'warning' && i.file.includes('PROJECT')), 'no project: warning issue mentions PROJECT');
    } finally {
      cleanup(base);
    }
  }

  console.log('\n=== Validator: complete directory → valid with no issues ===');
  {
    const base = createFixtureBase();
    try {
      const planning = createPlanningDir(base);
      writeFileSync(join(planning, 'ROADMAP.md'), SAMPLE_ROADMAP);
      writeFileSync(join(planning, 'PROJECT.md'), SAMPLE_PROJECT);
      writeFileSync(join(planning, 'REQUIREMENTS.md'), SAMPLE_REQUIREMENTS);
      writeFileSync(join(planning, 'STATE.md'), SAMPLE_STATE);
      mkdirSync(join(planning, 'phases'), { recursive: true });
      const result = await validatePlanningDirectory(planning);
      assertEq(result.valid, true, 'complete dir: validation passes');
      assertEq(result.issues.length, 0, 'complete dir: no issues');
    } finally {
      cleanup(base);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Roadmap Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldRoadmap: flat format ===');
  {
    const roadmap = parseOldRoadmap(SAMPLE_ROADMAP);
    assertEq(roadmap.milestones.length, 0, 'flat roadmap: no milestone sections');
    assertEq(roadmap.phases.length, 3, 'flat roadmap: 3 phases');
    assertEq(roadmap.phases[0].number, 29, 'flat roadmap: first phase number');
    assertEq(roadmap.phases[0].title, 'Auth System', 'flat roadmap: first phase title');
    assertEq(roadmap.phases[0].done, true, 'flat roadmap: first phase done');
    assertEq(roadmap.phases[1].done, false, 'flat roadmap: second phase not done');
  }

  console.log('\n=== parseOldRoadmap: milestone-sectioned with <details> ===');
  {
    const roadmap = parseOldRoadmap(SAMPLE_MILESTONE_SECTIONED_ROADMAP);
    assert(roadmap.milestones.length >= 2, 'ms roadmap: has milestone sections');

    const v20 = roadmap.milestones.find(m => m.id.includes('2.0'));
    assert(v20 !== undefined, 'ms roadmap: v2.0 found');
    assertEq(v20?.collapsed, true, 'ms roadmap: v2.0 collapsed');
    assert((v20?.phases.length ?? 0) >= 2, 'ms roadmap: v2.0 has phases');
    assert(v20?.phases.every(p => p.done) ?? false, 'ms roadmap: v2.0 all done');

    const v25 = roadmap.milestones.find(m => m.id.includes('2.5'));
    assert(v25 !== undefined, 'ms roadmap: v2.5 found');
    assertEq(v25?.collapsed, false, 'ms roadmap: v2.5 not collapsed');
    assert((v25?.phases.length ?? 0) >= 3, 'ms roadmap: v2.5 has 3 phases');

    const p29 = v25?.phases.find(p => p.number === 29);
    assertEq(p29?.done, true, 'ms roadmap: phase 29 done');
    const p30 = v25?.phases.find(p => p.number === 30);
    assertEq(p30?.done, false, 'ms roadmap: phase 30 not done');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Plan Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldPlan: XML-in-markdown ===');
  {
    const plan = parseOldPlan(SAMPLE_PLAN_XML, '29-01-PLAN.md', '01');
    assert(plan.objective.includes('authentication'), 'plan: objective extracted');
    assertEq(plan.tasks.length, 3, 'plan: 3 tasks');
    assert(plan.tasks[0].includes('auth middleware'), 'plan: first task content');
    assert(plan.context.includes('JWT'), 'plan: context extracted');
    assert(plan.verification.includes('Login returns'), 'plan: verification extracted');
    assert(plan.successCriteria.includes('endpoints respond'), 'plan: success criteria extracted');

    // Frontmatter
    assertEq(plan.frontmatter.phase, '29-auth-system', 'plan fm: phase');
    assertEq(plan.frontmatter.plan, '01', 'plan fm: plan');
    assertEq(plan.frontmatter.type, 'implementation', 'plan fm: type');
    assertEq(plan.frontmatter.wave, 1, 'plan fm: wave');
    assertEq(plan.frontmatter.autonomous, true, 'plan fm: autonomous');
    assert(plan.frontmatter.files_modified.length >= 2, 'plan fm: files_modified');
    assert(plan.frontmatter.must_haves !== null, 'plan fm: must_haves parsed');
    assert((plan.frontmatter.must_haves?.truths.length ?? 0) >= 1, 'plan fm: must_haves truths');
    assert((plan.frontmatter.must_haves?.artifacts.length ?? 0) >= 1, 'plan fm: must_haves artifacts');
  }

  console.log('\n=== parseOldPlan: plain markdown (no XML tags) ===');
  {
    const plainPlan = `# 001: Fix Login Bug

## Description

Fix the login button not responding on mobile.

## Steps

1. Debug click handler
2. Fix event propagation
`;
    const plan = parseOldPlan(plainPlan, '001-PLAN.md', '001');
    assertEq(plan.objective, '', 'plain plan: no objective (no XML)');
    assertEq(plan.tasks.length, 0, 'plain plan: no tasks (no XML)');
    assertEq(plan.frontmatter.phase, '', 'plain plan: no frontmatter phase');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Summary Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldSummary: YAML frontmatter ===');
  {
    const summary = parseOldSummary(SAMPLE_SUMMARY, '29-01-SUMMARY.md', '01');
    assertEq(summary.frontmatter.phase, '29-auth-system', 'summary fm: phase');
    assertEq(summary.frontmatter.plan, '01', 'summary fm: plan');
    assertEq(summary.frontmatter.subsystem, 'auth', 'summary fm: subsystem');
    assertEq(summary.frontmatter.tags, ['authentication', 'security'], 'summary fm: tags');
    assertEq(summary.frontmatter.provides, ['auth-middleware', 'jwt-validation'], 'summary fm: provides');
    assertEq(summary.frontmatter.affects, ['api-routes'], 'summary fm: affects');
    assertEq(summary.frontmatter['tech-stack'], ['jsonwebtoken', 'express'], 'summary fm: tech-stack');
    assertEq(summary.frontmatter['key-files'], ['src/auth.ts', 'src/middleware/auth.ts'], 'summary fm: key-files');
    assertEq(summary.frontmatter['key-decisions'], ['Use RS256 for JWT signing', 'Store refresh tokens in DB'], 'summary fm: key-decisions');
    assertEq(summary.frontmatter['patterns-established'], ['Middleware-based auth'], 'summary fm: patterns-established');
    assertEq(summary.frontmatter.duration, '2h', 'summary fm: duration');
    assertEq(summary.frontmatter.completed, '2026-01-15', 'summary fm: completed');
    assert(summary.body.includes('Auth Implementation Summary'), 'summary: body content present');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Requirements Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldRequirements ===');
  {
    const reqs = parseOldRequirements(SAMPLE_REQUIREMENTS);
    assertEq(reqs.length, 4, 'requirements: 4 entries');
    assertEq(reqs[0].id, 'R001', 'req 0: id');
    assertEq(reqs[0].title, 'User Authentication', 'req 0: title');
    assertEq(reqs[0].status, 'active', 'req 0: status');
    assert(reqs[0].description.includes('log in'), 'req 0: description');
    assertEq(reqs[2].id, 'R003', 'req 2: id');
    assertEq(reqs[2].status, 'validated', 'req 2: status');
    assertEq(reqs[3].id, 'R004', 'req 3: id');
    assertEq(reqs[3].status, 'deferred', 'req 3: status');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // State Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldState ===');
  {
    const state = parseOldState(SAMPLE_STATE);
    assert(state.currentPhase?.includes('30') ?? false, 'state: current phase includes 30');
    assertEq(state.status, 'in-progress', 'state: status');
    assert(state.raw === SAMPLE_STATE, 'state: raw preserved');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Config Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldConfig: valid JSON ===');
  {
    const config = parseOldConfig('{"projectName":"test","version":"1.0"}');
    assert(config !== null, 'config: parsed');
    assertEq(config?.projectName, 'test', 'config: projectName');
  }

  console.log('\n=== parseOldConfig: invalid JSON → null ===');
  {
    const config = parseOldConfig('not json at all {{{');
    assertEq(config, null, 'config: invalid JSON returns null');
  }

  console.log('\n=== parseOldConfig: non-object JSON → null ===');
  {
    const config = parseOldConfig('"just a string"');
    assertEq(config, null, 'config: non-object returns null');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Project Parser Tests
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== parseOldProject ===');
  {
    const project = parseOldProject(SAMPLE_PROJECT);
    assertEq(project, SAMPLE_PROJECT, 'project: returns raw content');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All tests passed ✓');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
