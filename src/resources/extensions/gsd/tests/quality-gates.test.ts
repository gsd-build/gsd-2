import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractSection } from "../files.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, "..", "templates");
const promptsDir = join(__dirname, "..", "prompts");

function loadTemplate(name: string): string {
  return readFileSync(join(templatesDir, `${name}.md`), "utf-8");
}

function loadPrompt(name: string): string {
  return readFileSync(join(promptsDir, `${name}.md`), "utf-8");
}

// ═══════════════════════════════════════════════════════════════════════════
// Level 1: Templates contain quality gate headings
// ═══════════════════════════════════════════════════════════════════════════

test("Level 1: Templates contain quality gate headings", () => {
  const plan = loadTemplate("plan");
  assert.ok(plan.includes("## Threat Surface"), "plan.md contains ## Threat Surface");
  assert.ok(plan.includes("## Requirement Impact"), "plan.md contains ## Requirement Impact");

  const taskPlan = loadTemplate("task-plan");
  assert.ok(taskPlan.includes("## Failure Modes"), "task-plan.md contains ## Failure Modes");
  assert.ok(taskPlan.includes("## Load Profile"), "task-plan.md contains ## Load Profile");
  assert.ok(taskPlan.includes("## Negative Tests"), "task-plan.md contains ## Negative Tests");

  const sliceSummary = loadTemplate("slice-summary");
  assert.ok(sliceSummary.includes("## Operational Readiness"), "slice-summary.md contains ## Operational Readiness");

  const roadmap = loadTemplate("roadmap");
  assert.ok(roadmap.includes("## Horizontal Checklist"), "roadmap.md contains ## Horizontal Checklist");

  const milestoneSummary = loadTemplate("milestone-summary");
  assert.ok(milestoneSummary.includes("## Decision Re-evaluation"), "milestone-summary.md contains ## Decision Re-evaluation");
});

// ═══════════════════════════════════════════════════════════════════════════
// Level 2: Prompts reference quality gates
// ═══════════════════════════════════════════════════════════════════════════

test("Level 2: Prompts reference quality gates", () => {
  const planSlice = loadPrompt("plan-slice");
  assert.ok(planSlice.includes("Threat Surface"), "plan-slice.md mentions Threat Surface");
  assert.ok(planSlice.includes("Requirement Impact"), "plan-slice.md mentions Requirement Impact");
  assert.ok(planSlice.toLowerCase().includes("quality gate"), "plan-slice.md mentions quality gate");

  const guidedPlanSlice = loadPrompt("guided-plan-slice");
  assert.ok(
    guidedPlanSlice.includes("Threat Surface") || guidedPlanSlice.includes("Q3"),
    "guided-plan-slice.md mentions Threat Surface or Q3"
  );

  const executeTask = loadPrompt("execute-task");
  assert.ok(executeTask.includes("Failure Modes"), "execute-task.md mentions Failure Modes");
  assert.ok(executeTask.includes("Load Profile"), "execute-task.md mentions Load Profile");
  assert.ok(executeTask.includes("Negative Tests"), "execute-task.md mentions Negative Tests");

  const guidedExecuteTask = loadPrompt("guided-execute-task");
  assert.ok(
    guidedExecuteTask.includes("Failure Modes") || guidedExecuteTask.includes("Q5"),
    "guided-execute-task.md mentions Failure Modes or Q5"
  );

  const completeSlice = loadPrompt("complete-slice");
  assert.ok(completeSlice.includes("Operational Readiness"), "complete-slice.md mentions Operational Readiness");

  const guidedCompleteSlice = loadPrompt("guided-complete-slice");
  assert.ok(
    guidedCompleteSlice.includes("Operational Readiness") || guidedCompleteSlice.includes("Q8"),
    "guided-complete-slice.md mentions Operational Readiness or Q8"
  );

  const completeMilestone = loadPrompt("complete-milestone");
  assert.ok(completeMilestone.includes("Horizontal Checklist"), "complete-milestone.md mentions Horizontal Checklist");
  assert.ok(completeMilestone.includes("Decision Re-evaluation"), "complete-milestone.md mentions Decision Re-evaluation");

  const planMilestone = loadPrompt("plan-milestone");
  assert.ok(planMilestone.toLowerCase().includes("horizontal checklist"), "plan-milestone.md mentions horizontal checklist");

  const guidedPlanMilestone = loadPrompt("guided-plan-milestone");
  assert.ok(guidedPlanMilestone.includes("Horizontal Checklist"), "guided-plan-milestone.md mentions Horizontal Checklist");

  const reassess = loadPrompt("reassess-roadmap");
  assert.ok(reassess.includes("Threat Surface"), "reassess-roadmap.md mentions Threat Surface");
  assert.ok(reassess.includes("Operational Readiness"), "reassess-roadmap.md mentions Operational Readiness");
  assert.ok(reassess.includes("Horizontal Checklist"), "reassess-roadmap.md mentions Horizontal Checklist");

  const replan = loadPrompt("replan-slice");
  assert.ok(replan.includes("Threat Surface"), "replan-slice.md mentions Threat Surface");
});

// ═══════════════════════════════════════════════════════════════════════════
// Level 3: Parser backward compatibility — extractSection handles new headings
// ═══════════════════════════════════════════════════════════════════════════

test("Level 3: extractSection backward compatibility", () => {
  // Old-style slice plan (no quality gate sections)
  const oldPlan = `# S01: Auth Flow

**Goal:** Build login
**Demo:** User can log in

## Must-Haves

- Login form works
- Session persists

## Proof Level

- This slice proves: integration

## Tasks

- [ ] **T01: Build login** \`est:1h\`
`;

  // New-style slice plan (with quality gate sections)
  const newPlan = `# S01: Auth Flow

**Goal:** Build login
**Demo:** User can log in

## Must-Haves

- Login form works
- Session persists

## Threat Surface

- **Abuse**: Credential stuffing, brute force login attempts
- **Data exposure**: Session tokens in cookies, password in request body
- **Input trust**: Username/password from form input reaching DB query

## Requirement Impact

- **Requirements touched**: R001, R003
- **Re-verify**: Login flow, session management
- **Decisions revisited**: D002

## Proof Level

- This slice proves: integration

## Tasks

- [ ] **T01: Build login** \`est:1h\`
`;

  // Old plan: quality gate sections return null (not found)
  assert.ok(
    extractSection(oldPlan, "Threat Surface") === null,
    "extractSection returns null for Threat Surface on old plan"
  );
  assert.ok(
    extractSection(oldPlan, "Requirement Impact") === null,
    "extractSection returns null for Requirement Impact on old plan"
  );

  // Old plan: core sections still parse correctly
  const oldMustHaves = extractSection(oldPlan, "Must-Haves");
  assert.ok(
    oldMustHaves !== null && oldMustHaves.includes("Login form works"),
    "extractSection still parses Must-Haves on old plan"
  );

  // New plan: quality gate sections are extracted
  const threatSurface = extractSection(newPlan, "Threat Surface");
  assert.ok(
    threatSurface !== null && threatSurface.includes("Credential stuffing"),
    "extractSection extracts Threat Surface content from new plan"
  );

  const reqImpact = extractSection(newPlan, "Requirement Impact");
  assert.ok(
    reqImpact !== null && reqImpact.includes("R001"),
    "extractSection extracts Requirement Impact content from new plan"
  );

  // New plan: core sections still parse correctly
  const newMustHaves = extractSection(newPlan, "Must-Haves");
  assert.ok(
    newMustHaves !== null && newMustHaves.includes("Login form works"),
    "extractSection still parses Must-Haves on new plan"
  );

  // Task plan: Failure Modes
  const oldTaskPlan = `# T01: Build Login

## Description

Build the login endpoint.

## Steps

1. Create route
`;

  const newTaskPlan = `# T01: Build Login

## Description

Build the login endpoint.

## Failure Modes

| Dependency | On error | On timeout | On malformed response |
|------------|----------|-----------|----------------------|
| Auth DB | Return 500 | 3s timeout, retry once | Reject, log warning |

## Steps

1. Create route
`;

  assert.ok(
    extractSection(oldTaskPlan, "Failure Modes") === null,
    "extractSection returns null for Failure Modes on old task plan"
  );

  const failureModes = extractSection(newTaskPlan, "Failure Modes");
  assert.ok(
    failureModes !== null && failureModes.includes("Auth DB"),
    "extractSection extracts Failure Modes content from new task plan"
  );

  // Slice summary: Operational Readiness
  const oldSummary = `# S01: Auth Flow

**Built login with session management**

## Verification

All tests pass.

## Deviations

None.
`;

  const newSummary = `# S01: Auth Flow

**Built login with session management**

## Verification

All tests pass.

## Operational Readiness

- **Health signal**: /health endpoint returns 200 with session count
- **Failure signal**: Auth error rate > 5% triggers alert
- **Recovery**: Stateless — restart clears nothing
- **Monitoring gaps**: None

## Deviations

None.
`;

  assert.ok(
    extractSection(oldSummary, "Operational Readiness") === null,
    "extractSection returns null for Operational Readiness on old summary"
  );

  const opReadiness = extractSection(newSummary, "Operational Readiness");
  assert.ok(
    opReadiness !== null && opReadiness.includes("/health endpoint"),
    "extractSection extracts Operational Readiness content from new summary"
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Level 4: Template section ordering is correct
// ═══════════════════════════════════════════════════════════════════════════

test("Level 4: Template section ordering", () => {
  const plan = loadTemplate("plan");
  const mustHavesIdx = plan.indexOf("## Must-Haves");
  const threatIdx = plan.indexOf("## Threat Surface");
  const proofIdx = plan.indexOf("## Proof Level");
  assert.ok(
    mustHavesIdx < threatIdx && threatIdx < proofIdx,
    "plan.md: Threat Surface is between Must-Haves and Proof Level"
  );

  const reqImpactIdx = plan.indexOf("## Requirement Impact");
  assert.ok(
    threatIdx < reqImpactIdx && reqImpactIdx < proofIdx,
    "plan.md: Requirement Impact is between Threat Surface and Proof Level"
  );

  const taskPlan = loadTemplate("task-plan");
  const descIdx = taskPlan.indexOf("## Description");
  const failIdx = taskPlan.indexOf("## Failure Modes");
  const stepsIdx = taskPlan.indexOf("## Steps");
  assert.ok(
    descIdx < failIdx && failIdx < stepsIdx,
    "task-plan.md: Failure Modes is between Description and Steps"
  );

  const loadIdx = taskPlan.indexOf("## Load Profile");
  const negIdx = taskPlan.indexOf("## Negative Tests");
  assert.ok(
    failIdx < loadIdx && loadIdx < negIdx && negIdx < stepsIdx,
    "task-plan.md: Failure Modes < Load Profile < Negative Tests < Steps"
  );

  const sliceSummary = loadTemplate("slice-summary");
  const reqInvalidIdx = sliceSummary.indexOf("## Requirements Invalidated");
  const opIdx = sliceSummary.indexOf("## Operational Readiness");
  const devIdx = sliceSummary.indexOf("## Deviations");
  assert.ok(
    reqInvalidIdx < opIdx && opIdx < devIdx,
    "slice-summary.md: Operational Readiness is between Requirements Invalidated and Deviations"
  );

  const roadmap = loadTemplate("roadmap");
  const horizIdx = roadmap.indexOf("## Horizontal Checklist");
  const boundaryIdx = roadmap.indexOf("## Boundary Map");
  assert.ok(
    horizIdx > 0 && horizIdx < boundaryIdx,
    "roadmap.md: Horizontal Checklist is before Boundary Map"
  );

  const milestoneSummary = loadTemplate("milestone-summary");
  const reqChangesIdx = milestoneSummary.indexOf("## Requirement Changes");
  const decRevalIdx = milestoneSummary.indexOf("## Decision Re-evaluation");
  const fwdIntelIdx = milestoneSummary.indexOf("## Forward Intelligence");
  assert.ok(
    reqChangesIdx < decRevalIdx && decRevalIdx < fwdIntelIdx,
    "milestone-summary.md: Decision Re-evaluation is between Requirement Changes and Forward Intelligence"
  );
});
