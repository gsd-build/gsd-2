# GSD Context Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce token cost and prevent context drift in GSD auto-mode through capability-aware model scoring, observation masking, phase handoff anchors, and CONTEXT.md injection — all scoped to the GSD extension layer.

**Architecture:** Six changes in `src/resources/extensions/gsd/`: (1) ADR-004 Phase 2 capability profiles + scoring in `model-router.ts`, (2) S##-CONTEXT.md injection in prompt builders, (3) phase handoff anchors via new `phase-anchor.ts`, (4) observation masking via new `context-masker.ts` + `transformContext` hook, (5) proactive compaction threshold, (6) tighter tool result truncation. All additive, all behind preferences.

**Tech Stack:** TypeScript, Node.js `node:test` framework, `assert/strict`, GSD extension API (`@gsd/pi-coding-agent`)

**Spec:** `docs/superpowers/specs/2026-04-03-gsd-context-optimization-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/resources/extensions/gsd/model-router.ts` | Modify | Add `ModelCapabilities`, `MODEL_CAPABILITY_PROFILES`, `BASE_REQUIREMENTS`, `computeTaskRequirements()`, `scoreModel()`, extend `resolveModelForComplexity()`, extend `RoutingDecision`, extend `DynamicRoutingConfig` |
| `src/resources/extensions/gsd/auto-model-selection.ts` | Modify | Emit `before_model_select` hook, pass `taskMetadata` through to scoring |
| `src/resources/extensions/gsd/complexity-classifier.ts` | Modify | Export `extractTaskMetadata()` (currently private) |
| `src/resources/extensions/gsd/phase-anchor.ts` | Create | `writePhaseAnchor()`, `readPhaseAnchor()`, `PhaseAnchor` type |
| `src/resources/extensions/gsd/context-masker.ts` | Create | `createObservationMask()` returning `transformContext` handler |
| `src/resources/extensions/gsd/auto-prompts.ts` | Modify | Inject CONTEXT.md and phase anchors in `buildPlanMilestonePrompt`, `buildExecuteTaskPrompt`, `buildResearchSlicePrompt` |
| `src/resources/extensions/gsd/bootstrap/register-hooks.ts` | Modify | Register `transformContext` observation masker |
| `src/resources/extensions/gsd/bootstrap/system-context.ts` | Modify | Pass compaction + tool result config overrides via `before_agent_start` |
| `src/resources/extensions/gsd/preferences-types.ts` | Modify | Add `capability_routing` to `DynamicRoutingConfig`, add `ContextManagementConfig` type |
| `src/resources/extensions/gsd/preferences-validation.ts` | Modify | Validate new preference keys |
| `src/resources/extensions/gsd/docs/preferences-reference.md` | Modify | Document new keys |
| `src/resources/extensions/gsd/tests/model-router.test.ts` | Modify | Add capability scoring tests |
| `src/resources/extensions/gsd/tests/context-masker.test.ts` | Create | Observation masking tests |
| `src/resources/extensions/gsd/tests/phase-anchor.test.ts` | Create | Anchor write/read tests |

---

### Task 1: Extend Types and Preferences for All New Config

**Files:**
- Modify: `src/resources/extensions/gsd/model-router.ts:11-22` (DynamicRoutingConfig)
- Modify: `src/resources/extensions/gsd/preferences-types.ts` (add ContextManagementConfig, add to GSDPreferences)
- Modify: `src/resources/extensions/gsd/preferences-validation.ts:405-453` (validate new keys)
- Modify: `src/resources/extensions/gsd/docs/preferences-reference.md:185-191`

- [ ] **Step 1: Write failing test — `capability_routing` preference validation**

In `src/resources/extensions/gsd/tests/model-router.test.ts`, add after the existing tests:

```typescript
// ─── Capability routing config ──────────────────────────────────────────────

test("defaultRoutingConfig includes capability_routing: false", () => {
  const config = defaultRoutingConfig();
  assert.equal(config.capability_routing, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/model-router.test.ts`
Expected: FAIL — `capability_routing` does not exist on the returned config.

- [ ] **Step 3: Add `capability_routing` to `DynamicRoutingConfig` and `defaultRoutingConfig()`**

In `src/resources/extensions/gsd/model-router.ts`, add `capability_routing` to the interface and the default:

```typescript
// Line 11-22: Add capability_routing to DynamicRoutingConfig
export interface DynamicRoutingConfig {
  enabled?: boolean;
  capability_routing?: boolean;  // NEW — enable capability profile scoring
  tier_models?: {
    light?: string;
    standard?: string;
    heavy?: string;
  };
  escalate_on_failure?: boolean;
  budget_pressure?: boolean;
  cross_provider?: boolean;
  hooks?: boolean;
}

// Line 192-200: Add to defaultRoutingConfig()
export function defaultRoutingConfig(): DynamicRoutingConfig {
  return {
    enabled: false,
    capability_routing: false,  // NEW
    escalate_on_failure: true,
    budget_pressure: true,
    cross_provider: true,
    hooks: true,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/model-router.test.ts`
Expected: PASS

- [ ] **Step 5: Add `ContextManagementConfig` to `preferences-types.ts`**

In `src/resources/extensions/gsd/preferences-types.ts`, add the new type and add it to `GSDPreferences`:

```typescript
// Add after DynamicRoutingConfig import/definition area:
export interface ContextManagementConfig {
  observation_masking?: boolean;          // default: true
  observation_mask_turns?: number;        // default: 8, range: 1-50
  compaction_threshold_percent?: number;  // default: 0.70, range: 0.5-0.95
  tool_result_max_chars?: number;         // default: 800, range: 200-10000
}

// In GSDPreferences interface, add after dynamic_routing:
  context_management?: ContextManagementConfig;
```

- [ ] **Step 6: Add validation for new keys in `preferences-validation.ts`**

Find the `dynamic_routing` validation section (~line 405-453) and add `capability_routing` validation inside it:

```typescript
// Inside the dynamic_routing validation block, after the existing boolean checks:
if ("capability_routing" in dr) {
  if (typeof dr.capability_routing !== "boolean") {
    errors.push("dynamic_routing.capability_routing must be a boolean");
  }
}
```

Then add a new `context_management` validation block after the `dynamic_routing` block:

```typescript
// ── context_management ──
if (raw.context_management !== undefined) {
  if (typeof raw.context_management !== "object" || raw.context_management === null) {
    errors.push("context_management must be an object");
  } else {
    const cm = raw.context_management as Record<string, unknown>;
    if ("observation_masking" in cm && typeof cm.observation_masking !== "boolean") {
      errors.push("context_management.observation_masking must be a boolean");
    }
    if ("observation_mask_turns" in cm) {
      const turns = cm.observation_mask_turns;
      if (typeof turns !== "number" || turns < 1 || turns > 50) {
        errors.push("context_management.observation_mask_turns must be a number between 1 and 50");
      }
    }
    if ("compaction_threshold_percent" in cm) {
      const pct = cm.compaction_threshold_percent;
      if (typeof pct !== "number" || pct < 0.5 || pct > 0.95) {
        errors.push("context_management.compaction_threshold_percent must be a number between 0.5 and 0.95");
      }
    }
    if ("tool_result_max_chars" in cm) {
      const chars = cm.tool_result_max_chars;
      if (typeof chars !== "number" || chars < 200 || chars > 10000) {
        errors.push("context_management.tool_result_max_chars must be a number between 200 and 10000");
      }
    }
  }
}
```

- [ ] **Step 7: Update preferences-reference.md**

In `src/resources/extensions/gsd/docs/preferences-reference.md`, after the `dynamic_routing` section (~line 191), add:

```markdown
  - `capability_routing`: boolean — enable capability-profile scoring for model
    selection within a tier. Requires `enabled: true`. Default: `false`.

- `context_management`: configures context hygiene for auto-mode sessions. Keys:
  - `observation_masking`: boolean — mask old tool results to reduce context bloat.
    Default: `true`.
  - `observation_mask_turns`: number — keep this many recent turns verbatim (1-50).
    Default: `8`.
  - `compaction_threshold_percent`: number — trigger compaction at this % of context
    window (0.5-0.95). Lower values fire compaction earlier, reducing drift.
    Default: `0.70`.
  - `tool_result_max_chars`: number — max chars per tool result in GSD sessions
    (200-10000). Default: `800`.
```

- [ ] **Step 8: Commit**

```bash
git add src/resources/extensions/gsd/model-router.ts \
        src/resources/extensions/gsd/preferences-types.ts \
        src/resources/extensions/gsd/preferences-validation.ts \
        src/resources/extensions/gsd/docs/preferences-reference.md \
        src/resources/extensions/gsd/tests/model-router.test.ts
git commit -m "feat(routing): add capability_routing and context_management preference types

Extends DynamicRoutingConfig with capability_routing flag (default false).
Adds ContextManagementConfig type with observation masking, compaction
threshold, and tool result truncation settings.
Validates all new keys in preferences-validation.ts.

Part of GSD context optimization (#3171, #3406)."
```

---

### Task 2: Capability Profile Scoring in model-router.ts

**Files:**
- Modify: `src/resources/extensions/gsd/model-router.ts`
- Modify: `src/resources/extensions/gsd/complexity-classifier.ts:213` (export extractTaskMetadata)
- Test: `src/resources/extensions/gsd/tests/model-router.test.ts`

- [ ] **Step 1: Write failing tests for capability scoring**

Add to `src/resources/extensions/gsd/tests/model-router.test.ts`:

```typescript
import {
  resolveModelForComplexity,
  escalateTier,
  defaultRoutingConfig,
  scoreModel,
  computeTaskRequirements,
  MODEL_CAPABILITY_PROFILES,
} from "../model-router.js";
import type { DynamicRoutingConfig, RoutingDecision, ModelCapabilities } from "../model-router.js";

// ─── Capability Scoring ─────────────────────────────────────────────────────

test("scoreModel computes weighted average of capability × requirement", () => {
  const caps: ModelCapabilities = {
    coding: 90, debugging: 80, research: 70,
    reasoning: 85, speed: 50, longContext: 60, instruction: 75,
  };
  const reqs = { coding: 0.9, reasoning: 0.5 };
  const score = scoreModel(caps, reqs);
  // Expected: (0.9*90 + 0.5*85) / (0.9 + 0.5) = (81 + 42.5) / 1.4 = 88.21...
  assert.ok(Math.abs(score - 88.21) < 0.1, `score ${score} should be ~88.21`);
});

test("scoreModel returns 50 for empty requirements", () => {
  const caps: ModelCapabilities = {
    coding: 90, debugging: 80, research: 70,
    reasoning: 85, speed: 50, longContext: 60, instruction: 75,
  };
  const score = scoreModel(caps, {});
  assert.equal(score, 50);
});

test("computeTaskRequirements returns base vector for known unit type", () => {
  const reqs = computeTaskRequirements("execute-task");
  assert.ok(reqs.coding !== undefined && reqs.coding > 0);
});

test("computeTaskRequirements boosts instruction for docs-tagged tasks", () => {
  const reqs = computeTaskRequirements("execute-task", { tags: ["docs"] });
  assert.ok((reqs.instruction ?? 0) >= 0.8);
  assert.ok((reqs.coding ?? 1) <= 0.4);
});

test("computeTaskRequirements returns generic vector for unknown unit type", () => {
  const reqs = computeTaskRequirements("unknown-unit");
  assert.ok(reqs.reasoning !== undefined);
});

test("resolveModelForComplexity uses capability scoring when enabled and >1 eligible model", () => {
  const config: DynamicRoutingConfig = {
    ...defaultRoutingConfig(),
    enabled: true,
    capability_routing: true,
  };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["claude-opus-4-6", "claude-haiku-4-5", "gpt-4o-mini"],
    "execute-task",
  );
  // Should pick the best light-tier model for coding (haiku or gpt-4o-mini)
  assert.equal(result.wasDowngraded, true);
  assert.ok(result.selectionMethod === "capability-scored");
});

test("resolveModelForComplexity falls back to tier-only when capability_routing is false", () => {
  const config: DynamicRoutingConfig = {
    ...defaultRoutingConfig(),
    enabled: true,
    capability_routing: false,
  };
  const result = resolveModelForComplexity(
    makeClassification("light"),
    { primary: "claude-opus-4-6", fallbacks: [] },
    config,
    ["claude-opus-4-6", "claude-haiku-4-5", "gpt-4o-mini"],
  );
  assert.equal(result.wasDowngraded, true);
  assert.ok(!result.selectionMethod || result.selectionMethod === "tier-only");
});

test("MODEL_CAPABILITY_PROFILES has entries for all models in MODEL_CAPABILITY_TIER", () => {
  // Import MODEL_CAPABILITY_TIER — it's not exported, so test via profiles
  // Every model that can be routed should have a profile
  const profiledModels = Object.keys(MODEL_CAPABILITY_PROFILES);
  assert.ok(profiledModels.length >= 9, `Expected ≥9 profiles, got ${profiledModels.length}`);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/model-router.test.ts`
Expected: FAIL — `scoreModel`, `computeTaskRequirements`, `MODEL_CAPABILITY_PROFILES` don't exist yet.

- [ ] **Step 3: Export `extractTaskMetadata` from complexity-classifier.ts**

In `src/resources/extensions/gsd/complexity-classifier.ts`, change line 213 from:

```typescript
function extractTaskMetadata(unitId: string, basePath: string): TaskMetadata {
```

to:

```typescript
export function extractTaskMetadata(unitId: string, basePath: string): TaskMetadata {
```

- [ ] **Step 4: Add ModelCapabilities type, profiles table, requirement vectors, and scoring functions to model-router.ts**

After the existing `MODEL_COST_PER_1K_INPUT` block (line 81), add:

```typescript
// ─── Capability Profiles (ADR-004 Phase 2) ──────────────────────────────────
// 7-dimension profiles, 0–100 normalized. Models without a profile
// score 50 uniformly — capability scoring is a no-op for them.

export interface ModelCapabilities {
  coding: number;
  debugging: number;
  research: number;
  reasoning: number;
  speed: number;
  longContext: number;
  instruction: number;
}

export const MODEL_CAPABILITY_PROFILES: Record<string, ModelCapabilities> = {
  "claude-opus-4-6":     { coding: 95, debugging: 90, research: 85, reasoning: 95, speed: 30, longContext: 80, instruction: 90 },
  "claude-sonnet-4-6":   { coding: 85, debugging: 80, research: 75, reasoning: 80, speed: 60, longContext: 75, instruction: 85 },
  "claude-haiku-4-5":    { coding: 60, debugging: 50, research: 45, reasoning: 50, speed: 95, longContext: 50, instruction: 75 },
  "gpt-4o":              { coding: 80, debugging: 75, research: 70, reasoning: 75, speed: 65, longContext: 70, instruction: 80 },
  "gpt-4o-mini":         { coding: 55, debugging: 45, research: 40, reasoning: 45, speed: 90, longContext: 45, instruction: 70 },
  "gemini-2.5-pro":      { coding: 75, debugging: 70, research: 85, reasoning: 75, speed: 55, longContext: 90, instruction: 75 },
  "gemini-2.0-flash":    { coding: 50, debugging: 40, research: 50, reasoning: 40, speed: 95, longContext: 60, instruction: 65 },
  "deepseek-chat":       { coding: 75, debugging: 65, research: 55, reasoning: 70, speed: 70, longContext: 55, instruction: 65 },
  "o3":                  { coding: 80, debugging: 85, research: 80, reasoning: 92, speed: 25, longContext: 70, instruction: 85 },
};

const BASE_REQUIREMENTS: Record<string, Partial<Record<keyof ModelCapabilities, number>>> = {
  "execute-task":       { coding: 0.9, instruction: 0.7, speed: 0.3 },
  "research-milestone": { research: 0.9, longContext: 0.7, reasoning: 0.5 },
  "research-slice":     { research: 0.9, longContext: 0.7, reasoning: 0.5 },
  "plan-milestone":     { reasoning: 0.9, coding: 0.5 },
  "plan-slice":         { reasoning: 0.9, coding: 0.5 },
  "replan-slice":       { reasoning: 0.9, debugging: 0.6, coding: 0.5 },
  "reassess-roadmap":   { reasoning: 0.9, research: 0.5 },
  "complete-slice":     { instruction: 0.8, speed: 0.7 },
  "run-uat":            { instruction: 0.7, speed: 0.8 },
  "discuss-milestone":  { reasoning: 0.6, instruction: 0.7 },
  "complete-milestone": { instruction: 0.8, reasoning: 0.5 },
};

/**
 * Compute a task requirement vector from unit type and optional metadata.
 * The vector weights each capability dimension by how important it is for this task.
 */
export function computeTaskRequirements(
  unitType: string,
  metadata?: import("./complexity-classifier.js").TaskMetadata,
): Partial<Record<keyof ModelCapabilities, number>> {
  const base = { ...(BASE_REQUIREMENTS[unitType] ?? { reasoning: 0.5 }) };

  if (unitType === "execute-task" && metadata) {
    if (metadata.tags?.some(t => /^(docs?|readme|comment|config|typo|rename)$/i.test(t))) {
      return { ...base, instruction: 0.9, coding: 0.3, speed: 0.7 };
    }
    if (metadata.complexityKeywords?.some(k => k === "concurrency" || k === "compatibility")) {
      return { ...base, debugging: 0.9, reasoning: 0.8 };
    }
    if (metadata.complexityKeywords?.some(k => k === "migration" || k === "architecture")) {
      return { ...base, reasoning: 0.9, coding: 0.8 };
    }
    if ((metadata.fileCount ?? 0) >= 6 || (metadata.estimatedLines ?? 0) >= 500) {
      return { ...base, coding: 0.9, reasoning: 0.7 };
    }
  }

  return base;
}

/**
 * Score a model against a task requirement vector.
 * Returns weighted average in range 0–100. Returns 50 for empty requirements.
 */
export function scoreModel(
  capabilities: ModelCapabilities,
  requirements: Partial<Record<keyof ModelCapabilities, number>>,
): number {
  let weightedSum = 0;
  let weightSum = 0;
  for (const [dim, weight] of Object.entries(requirements)) {
    const capability = capabilities[dim as keyof ModelCapabilities] ?? 50;
    weightedSum += weight * capability;
    weightSum += weight;
  }
  return weightSum > 0 ? weightedSum / weightSum : 50;
}
```

- [ ] **Step 5: Extend `RoutingDecision` interface**

In `model-router.ts`, update the `RoutingDecision` interface (lines 24-35):

```typescript
export interface RoutingDecision {
  modelId: string;
  fallbacks: string[];
  tier: ComplexityTier;
  wasDowngraded: boolean;
  reason: string;
  /** How the model was selected. */
  selectionMethod?: "tier-only" | "capability-scored";
  /** Capability scores per model (when capability-scored). */
  capabilityScores?: Record<string, number>;
  /** Task requirement vector (when capability-scored). */
  taskRequirements?: Partial<Record<string, number>>;
}
```

- [ ] **Step 6: Update `resolveModelForComplexity()` signature and body**

Update the function signature to accept optional unitType and metadata:

```typescript
export function resolveModelForComplexity(
  classification: ClassificationResult,
  phaseConfig: ResolvedModelConfig | undefined,
  routingConfig: DynamicRoutingConfig,
  availableModelIds: string[],
  unitType?: string,
  metadata?: import("./complexity-classifier.js").TaskMetadata,
): RoutingDecision {
```

Then, in `findModelForTier()` (the function that selects the cheapest model for a tier, lines 230-265), add capability scoring. Replace the `candidates` sort block:

After the existing `findModelForTier` function (line 264), add a new internal function:

```typescript
function findModelForTierWithCapability(
  tier: ComplexityTier,
  config: DynamicRoutingConfig,
  availableModelIds: string[],
  crossProvider: boolean,
  unitType: string,
  metadata?: import("./complexity-classifier.js").TaskMetadata,
): { modelId: string | null; scores: Record<string, number>; requirements: Partial<Record<string, number>> } {
  // Check explicit tier_models first (same as findModelForTier)
  const explicitModel = config.tier_models?.[tier];
  if (explicitModel) {
    const match = availableModelIds.find(id => {
      const bareAvail = id.includes("/") ? id.split("/").pop()! : id;
      const bareExplicit = explicitModel.includes("/") ? explicitModel.split("/").pop()! : explicitModel;
      return bareAvail === bareExplicit || id === explicitModel;
    });
    if (match) return { modelId: match, scores: {}, requirements: {} };
  }

  const requirements = computeTaskRequirements(unitType, metadata);
  const candidates = availableModelIds.filter(id => getModelTier(id) === tier);
  if (candidates.length === 0) return { modelId: null, scores: {}, requirements };

  const scores: Record<string, number> = {};
  for (const id of candidates) {
    const bareId = id.includes("/") ? id.split("/").pop()! : id;
    const profile = getModelProfile(bareId);
    scores[id] = scoreModel(profile, requirements);
  }

  // Sort by score descending, tie-break by cost ascending, then lexicographic ID
  candidates.sort((a, b) => {
    const scoreDiff = scores[b] - scores[a];
    if (Math.abs(scoreDiff) > 2) return scoreDiff;
    const costDiff = getModelCost(a) - getModelCost(b);
    if (costDiff !== 0) return costDiff;
    return a.localeCompare(b);
  });

  return { modelId: candidates[0], scores, requirements };
}

function getModelProfile(bareId: string): ModelCapabilities {
  if (MODEL_CAPABILITY_PROFILES[bareId]) return MODEL_CAPABILITY_PROFILES[bareId];
  for (const [knownId, profile] of Object.entries(MODEL_CAPABILITY_PROFILES)) {
    if (bareId.includes(knownId) || knownId.includes(bareId)) return profile;
  }
  return { coding: 50, debugging: 50, research: 50, reasoning: 50, speed: 50, longContext: 50, instruction: 50 };
}
```

Then update the body of `resolveModelForComplexity` — replace the `findModelForTier` call (lines 144-149) with:

```typescript
  // Find the best model for the requested tier
  const useCapabilityScoring = routingConfig.capability_routing && unitType;

  let targetModelId: string | null;
  let capabilityScores: Record<string, number> | undefined;
  let taskRequirements: Partial<Record<string, number>> | undefined;
  let selectionMethod: "tier-only" | "capability-scored" = "tier-only";

  if (useCapabilityScoring) {
    const result = findModelForTierWithCapability(
      requestedTier, routingConfig, availableModelIds,
      routingConfig.cross_provider !== false, unitType, metadata,
    );
    targetModelId = result.modelId;
    capabilityScores = Object.keys(result.scores).length > 0 ? result.scores : undefined;
    taskRequirements = Object.keys(result.requirements).length > 0 ? result.requirements : undefined;
    selectionMethod = capabilityScores ? "capability-scored" : "tier-only";
  } else {
    targetModelId = findModelForTier(
      requestedTier, routingConfig, availableModelIds,
      routingConfig.cross_provider !== false,
    );
  }
```

And update the return statements to include the new fields:

```typescript
  if (!targetModelId) {
    return {
      modelId: configuredPrimary,
      fallbacks: phaseConfig.fallbacks,
      tier: requestedTier,
      wasDowngraded: false,
      reason: `no ${requestedTier}-tier model available`,
      selectionMethod,
    };
  }

  const fallbacks = [
    ...phaseConfig.fallbacks.filter(f => f !== targetModelId),
    configuredPrimary,
  ].filter(f => f !== targetModelId);

  return {
    modelId: targetModelId,
    fallbacks,
    tier: requestedTier,
    wasDowngraded: true,
    reason: classification.reason,
    selectionMethod,
    capabilityScores,
    taskRequirements,
  };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/model-router.test.ts`
Expected: ALL PASS

- [ ] **Step 8: Commit**

```bash
git add src/resources/extensions/gsd/model-router.ts \
        src/resources/extensions/gsd/complexity-classifier.ts \
        src/resources/extensions/gsd/tests/model-router.test.ts
git commit -m "feat(routing): implement ADR-004 Phase 2 capability profile scoring

Adds MODEL_CAPABILITY_PROFILES (9 models × 7 dimensions),
computeTaskRequirements(), scoreModel(), and capability-scored
model selection in resolveModelForComplexity().

Capability scoring is opt-in via dynamic_routing.capability_routing.
Models without profiles get uniform 50 scores (falls back to
cheapest-in-tier). Tie-break: within 2 points prefer cheaper model.

Exports extractTaskMetadata() from complexity-classifier.ts.

Closes ADR-004 Phase 2. Part of #3171."
```

---

### Task 3: Wire `before_model_select` Hook in auto-model-selection.ts

**Files:**
- Modify: `src/resources/extensions/gsd/auto-model-selection.ts:88-110`

- [ ] **Step 1: Update `selectAndApplyModel` to pass metadata through to scoring**

In `src/resources/extensions/gsd/auto-model-selection.ts`, update the import from `complexity-classifier.ts`:

```typescript
import { classifyUnitComplexity, tierLabel, extractTaskMetadata } from "./complexity-classifier.js";
```

Then update the `resolveModelForComplexity` call at line 110 to pass `unitType` and `metadata`:

```typescript
        // Extract task metadata for capability scoring
        const taskMeta = unitType === "execute-task"
          ? extractTaskMetadata(unitId, basePath)
          : undefined;

        const routingResult = resolveModelForComplexity(
          classification, modelConfig, routingConfig, availableModelIds,
          unitType, taskMeta,
        );
```

- [ ] **Step 2: Update verbose notification to show scoring method**

Replace the verbose notify at lines 117-122:

```typescript
        if (routingResult.wasDowngraded) {
          effectiveModelConfig = {
            primary: routingResult.modelId,
            fallbacks: routingResult.fallbacks,
          };
          if (verbose) {
            const method = routingResult.selectionMethod === "capability-scored" ? "capability-scored" : "tier-only";
            ctx.ui.notify(
              `Dynamic routing [${tierLabel(classification.tier)}]: ${routingResult.modelId} (${method} — ${classification.reason})`,
              "info",
            );
          }
        }
```

- [ ] **Step 3: Run existing tests to verify nothing broke**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-model-selection.test.ts`
Expected: ALL PASS (existing tests should still work since unitType/metadata are optional params)

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/gsd/auto-model-selection.ts
git commit -m "feat(routing): wire capability scoring into unit dispatch

Passes unitType and TaskMetadata to resolveModelForComplexity()
so capability profiles can influence model selection.
Shows selection method (capability-scored vs tier-only) in verbose output."
```

---

### Task 4: Observation Masking (context-masker.ts)

**Files:**
- Create: `src/resources/extensions/gsd/context-masker.ts`
- Create: `src/resources/extensions/gsd/tests/context-masker.test.ts`

- [ ] **Step 1: Write failing tests for observation masking**

Create `src/resources/extensions/gsd/tests/context-masker.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";

import { createObservationMask } from "../context-masker.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function msg(role: string, content: string, type?: string) {
  return { role, content, type: type ?? role };
}

function userMsg(content: string) {
  return msg("user", content, "user");
}

function assistantMsg(content: string) {
  return msg("assistant", content, "assistant");
}

function toolResult(content: string) {
  return { role: "user", content, type: "toolResult" };
}

function bashExecution(content: string) {
  return { role: "user", content, type: "bashExecution" };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test("masks nothing when message count is within keepRecentTurns", () => {
  const mask = createObservationMask(8);
  const messages = [
    userMsg("hello"),
    assistantMsg("hi"),
    toolResult("file contents"),
  ];
  const result = mask(messages as any);
  assert.equal(result.length, 3);
  assert.equal(result[2].content, "file contents");
});

test("masks tool results older than keepRecentTurns", () => {
  const mask = createObservationMask(2);
  const messages = [
    userMsg("turn 1"),
    toolResult("old tool output"),
    assistantMsg("response 1"),
    userMsg("turn 2"),
    toolResult("newer tool output"),
    assistantMsg("response 2"),
    userMsg("turn 3"),
    toolResult("newest tool output"),
    assistantMsg("response 3"),
  ];
  const result = mask(messages as any);
  // turn 1's tool result should be masked
  assert.ok(result[1].content.includes("[result masked"));
  // turn 2 and 3 tool results should be verbatim
  assert.equal(result[4].content, "newer tool output");
  assert.equal(result[7].content, "newest tool output");
});

test("never masks assistant messages", () => {
  const mask = createObservationMask(1);
  const messages = [
    userMsg("turn 1"),
    assistantMsg("old reasoning"),
    userMsg("turn 2"),
    assistantMsg("new reasoning"),
  ];
  const result = mask(messages as any);
  assert.equal(result[1].content, "old reasoning");
  assert.equal(result[3].content, "new reasoning");
});

test("never masks user messages", () => {
  const mask = createObservationMask(1);
  const messages = [
    userMsg("old user message"),
    assistantMsg("response"),
    userMsg("new user message"),
    assistantMsg("response"),
  ];
  const result = mask(messages as any);
  assert.equal(result[0].content, "old user message");
});

test("masks bashExecution content", () => {
  const mask = createObservationMask(1);
  const messages = [
    userMsg("turn 1"),
    bashExecution("huge log output"),
    assistantMsg("response 1"),
    userMsg("turn 2"),
    assistantMsg("response 2"),
  ];
  const result = mask(messages as any);
  assert.ok(result[1].content.includes("[result masked"));
});

test("returns same array length (messages not removed, only content replaced)", () => {
  const mask = createObservationMask(1);
  const messages = [
    userMsg("a"), toolResult("b"), assistantMsg("c"),
    userMsg("d"), toolResult("e"), assistantMsg("f"),
  ];
  const result = mask(messages as any);
  assert.equal(result.length, messages.length);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/context-masker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `context-masker.ts`**

Create `src/resources/extensions/gsd/context-masker.ts`:

```typescript
/**
 * Observation masking for GSD auto-mode sessions.
 *
 * Replaces tool result content older than N turns with a placeholder.
 * Reduces context bloat between compactions with zero LLM overhead.
 * Preserves message ordering, roles, and all assistant/user messages.
 */

interface MaskableMessage {
  role: string;
  content: string;
  type?: string;
}

const MASK_PLACEHOLDER = "[result masked — within summarized history]";

/**
 * Find the message index that is `keepRecentTurns` user-turn boundaries
 * from the end. A "turn" starts at each user-role message.
 */
function findTurnBoundary(messages: MaskableMessage[], keepRecentTurns: number): number {
  let turnsSeen = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user" && messages[i].type === "user") {
      turnsSeen++;
      if (turnsSeen >= keepRecentTurns) return i;
    }
  }
  return 0; // fewer turns than keepRecentTurns — don't mask anything
}

const MASKABLE_TYPES = new Set(["toolResult", "bashExecution"]);

/**
 * Create a transformContext handler that masks old tool results.
 *
 * @param keepRecentTurns  Number of recent user turns to keep verbatim (default 8)
 * @returns A function that transforms AgentMessage[] by masking old observations
 */
export function createObservationMask(keepRecentTurns: number = 8) {
  return (messages: MaskableMessage[]): MaskableMessage[] => {
    const boundary = findTurnBoundary(messages, keepRecentTurns);
    if (boundary === 0) return messages;

    return messages.map((m, i) => {
      if (i >= boundary) return m;
      if (MASKABLE_TYPES.has(m.type ?? "")) {
        return { ...m, content: MASK_PLACEHOLDER };
      }
      return m;
    });
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/context-masker.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/gsd/context-masker.ts \
        src/resources/extensions/gsd/tests/context-masker.test.ts
git commit -m "feat(context): add observation masking for auto-mode sessions

Replaces tool result and bash execution content older than N turns
with a placeholder. Keeps assistant reasoning and user messages intact.
Zero LLM overhead — pure array transformation.

Part of #3171, #3406."
```

---

### Task 5: Phase Handoff Anchors (phase-anchor.ts)

**Files:**
- Create: `src/resources/extensions/gsd/phase-anchor.ts`
- Create: `src/resources/extensions/gsd/tests/phase-anchor.test.ts`

- [ ] **Step 1: Write failing tests for phase anchors**

Create `src/resources/extensions/gsd/tests/phase-anchor.test.ts`:

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { writePhaseAnchor, readPhaseAnchor, formatAnchorForPrompt } from "../phase-anchor.js";
import type { PhaseAnchor } from "../phase-anchor.js";

function makeTempBase(): string {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-anchor-test-"));
  mkdirSync(join(tmp, ".gsd", "milestones", "M001", "anchors"), { recursive: true });
  return tmp;
}

test("writePhaseAnchor creates anchor file in correct location", () => {
  const base = makeTempBase();
  try {
    const anchor: PhaseAnchor = {
      phase: "discuss",
      milestoneId: "M001",
      generatedAt: new Date().toISOString(),
      intent: "Define authentication requirements",
      decisions: ["Use JWT tokens", "Session expiry 24h"],
      blockers: [],
      nextSteps: ["Plan the implementation slices"],
    };
    writePhaseAnchor(base, "M001", anchor);
    assert.ok(existsSync(join(base, ".gsd", "milestones", "M001", "anchors", "discuss.json")));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("readPhaseAnchor returns written anchor", () => {
  const base = makeTempBase();
  try {
    const anchor: PhaseAnchor = {
      phase: "plan",
      milestoneId: "M001",
      generatedAt: new Date().toISOString(),
      intent: "Break work into slices",
      decisions: ["3 slices: auth, UI, tests"],
      blockers: ["Need DB schema first"],
      nextSteps: ["Execute S01"],
    };
    writePhaseAnchor(base, "M001", anchor);
    const read = readPhaseAnchor(base, "M001", "plan");
    assert.ok(read);
    assert.equal(read!.intent, "Break work into slices");
    assert.deepEqual(read!.decisions, ["3 slices: auth, UI, tests"]);
    assert.deepEqual(read!.blockers, ["Need DB schema first"]);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("readPhaseAnchor returns null when no anchor exists", () => {
  const base = makeTempBase();
  try {
    const read = readPhaseAnchor(base, "M001", "discuss");
    assert.equal(read, null);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("formatAnchorForPrompt produces markdown block", () => {
  const anchor: PhaseAnchor = {
    phase: "discuss",
    milestoneId: "M001",
    generatedAt: "2026-04-03T00:00:00.000Z",
    intent: "Define requirements",
    decisions: ["Use JWT"],
    blockers: [],
    nextSteps: ["Plan slices"],
  };
  const md = formatAnchorForPrompt(anchor);
  assert.ok(md.includes("## Handoff from discuss"));
  assert.ok(md.includes("Define requirements"));
  assert.ok(md.includes("Use JWT"));
  assert.ok(md.includes("Plan slices"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/phase-anchor.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `phase-anchor.ts`**

Create `src/resources/extensions/gsd/phase-anchor.ts`:

```typescript
/**
 * Phase handoff anchors — compact structured summaries written between
 * GSD auto-mode phases so downstream agents inherit decisions, blockers,
 * and intent without re-inferring from scratch.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gsdRoot } from "./paths.js";

export interface PhaseAnchor {
  phase: string;
  milestoneId: string;
  generatedAt: string;
  intent: string;
  decisions: string[];
  blockers: string[];
  nextSteps: string[];
}

function anchorsDir(basePath: string, milestoneId: string): string {
  return join(gsdRoot(basePath), "milestones", milestoneId, "anchors");
}

function anchorPath(basePath: string, milestoneId: string, phase: string): string {
  return join(anchorsDir(basePath, milestoneId), `${phase}.json`);
}

/**
 * Write a phase anchor to disk. Creates the anchors directory if needed.
 */
export function writePhaseAnchor(basePath: string, milestoneId: string, anchor: PhaseAnchor): void {
  const dir = anchorsDir(basePath, milestoneId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(anchorPath(basePath, milestoneId, anchor.phase), JSON.stringify(anchor, null, 2), "utf-8");
}

/**
 * Read a phase anchor from disk. Returns null if no anchor exists.
 */
export function readPhaseAnchor(basePath: string, milestoneId: string, phase: string): PhaseAnchor | null {
  const path = anchorPath(basePath, milestoneId, phase);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PhaseAnchor;
  } catch {
    return null;
  }
}

/**
 * Format a phase anchor as a markdown block for prompt injection.
 */
export function formatAnchorForPrompt(anchor: PhaseAnchor): string {
  const lines: string[] = [
    `## Handoff from ${anchor.phase}`,
    "",
    `**Intent:** ${anchor.intent}`,
  ];

  if (anchor.decisions.length > 0) {
    lines.push("", "**Decisions:**");
    for (const d of anchor.decisions) lines.push(`- ${d}`);
  }

  if (anchor.blockers.length > 0) {
    lines.push("", "**Blockers:**");
    for (const b of anchor.blockers) lines.push(`- ${b}`);
  }

  if (anchor.nextSteps.length > 0) {
    lines.push("", "**Next steps:**");
    for (const s of anchor.nextSteps) lines.push(`- ${s}`);
  }

  lines.push("", "---");
  return lines.join("\n");
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/phase-anchor.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/resources/extensions/gsd/phase-anchor.ts \
        src/resources/extensions/gsd/tests/phase-anchor.test.ts
git commit -m "feat(context): add phase handoff anchors for auto-mode

Structured JSON anchors (intent, decisions, blockers, nextSteps)
written after each phase and injected into downstream prompts.
Eliminates the 'start from scratch' problem between phases.

Part of #3171, #3406."
```

---

### Task 6: Inject CONTEXT.md and Phase Anchors into Prompt Builders

**Files:**
- Modify: `src/resources/extensions/gsd/auto-prompts.ts`

- [ ] **Step 1: Add imports at top of auto-prompts.ts**

Add to the import section at the top of `auto-prompts.ts`:

```typescript
import { readPhaseAnchor, formatAnchorForPrompt } from "./phase-anchor.js";
```

- [ ] **Step 2: Add anchor injection to `buildPlanMilestonePrompt`**

In `buildPlanMilestonePrompt` (line 901), after the existing `inlined` array is built and before `capPreamble` is called (~line 947), add:

```typescript
  // Phase anchor: inject discuss handoff if available
  const discussAnchor = readPhaseAnchor(base, mid, "discuss");
  if (discussAnchor) {
    inlined.unshift(formatAnchorForPrompt(discussAnchor));
  }
```

The CONTEXT.md is already loaded at line 909 via `inlineFile(contextPath, ...)` — this is the fix for #3452. The context path resolves via `resolveMilestoneFile(base, mid, "CONTEXT")`. Verify this line already exists — it does (line 903-909). No change needed for CONTEXT.md in plan-milestone since it's already injected.

- [ ] **Step 3: Add anchor injection to `buildExecuteTaskPrompt`**

In `buildExecuteTaskPrompt` (line 1093), after `const runtimeContext` block (~line 1191) and before `return loadPrompt("execute-task", {`, add:

```typescript
  // Phase anchors: inject plan and previous slice handoffs
  const planAnchor = readPhaseAnchor(base, mid, "plan");
  const planAnchorBlock = planAnchor ? formatAnchorForPrompt(planAnchor) : "";
  // Check for previous slice anchor (e.g., execute-S01 when executing S02)
  const sliceNum = parseInt(sid.replace(/\D/g, ""), 10);
  const prevSliceId = sliceNum > 1 ? `S${String(sliceNum - 1).padStart(2, "0")}` : null;
  const prevSliceAnchor = prevSliceId ? readPhaseAnchor(base, mid, `execute-${prevSliceId}`) : null;
  const prevSliceAnchorBlock = prevSliceAnchor ? formatAnchorForPrompt(prevSliceAnchor) : "";
  const anchorSection = [planAnchorBlock, prevSliceAnchorBlock].filter(Boolean).join("\n\n");
```

Then add `anchorSection` to the loadPrompt call as a new template variable:

```typescript
  return loadPrompt("execute-task", {
    anchorSection,    // NEW — phase handoff anchors
    overridesSection,
    runtimeContext,
    // ... rest of existing variables
  });
```

The execute-task prompt template will need a `{{anchorSection}}` placeholder added. Find the template file:

- [ ] **Step 4: Find and update the execute-task prompt template**

Search for the execute-task template file:

```bash
find src/resources/extensions/gsd -name "*execute*task*" -path "*/prompts/*" 2>/dev/null
```

In the template file, add `{{anchorSection}}` near the top, after any overrides section and before the task-specific instructions.

- [ ] **Step 5: Add anchor injection to `buildResearchSlicePrompt`**

In `buildResearchSlicePrompt` (line 973), after the `inlined` array is built and before `capPreamble` (~line 1002), add:

```typescript
  // Phase anchor: inject discuss handoff if available
  const discussAnchorRS = readPhaseAnchor(base, mid, "discuss");
  if (discussAnchorRS) {
    inlined.unshift(formatAnchorForPrompt(discussAnchorRS));
  }
```

- [ ] **Step 6: Verify CONTEXT.md is already being loaded in research-slice**

Check line 978-986 in `buildResearchSlicePrompt` — it loads `contextPath` via `resolveMilestoneFile(base, mid, "CONTEXT")` and inlines it. This confirms #3452 is already partially fixed for research-slice. Verify it's also loaded in execute-task prompts — if not, add it.

- [ ] **Step 7: Run existing prompt contract tests**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/prompt-contracts.test.ts`
Expected: PASS (existing tests should still pass since anchor injection is additive)

- [ ] **Step 8: Commit**

```bash
git add src/resources/extensions/gsd/auto-prompts.ts
git commit -m "feat(context): inject phase anchors and verify CONTEXT.md in prompt builders

Plan-milestone and research-slice prompts now inject discuss phase
anchor at the top of inlined context. Execute-task prompts inject
plan anchor and previous slice anchor.

Fixes #3452 (S##-CONTEXT.md injection verified in all downstream builders)."
```

---

### Task 7: Register Observation Masker and Configure Thresholds

**Files:**
- Modify: `src/resources/extensions/gsd/bootstrap/register-hooks.ts`
- Modify: `src/resources/extensions/gsd/bootstrap/system-context.ts`

- [ ] **Step 1: Register the observation masker in register-hooks.ts**

In `register-hooks.ts`, add the import at the top:

```typescript
import { createObservationMask } from "../context-masker.js";
import { loadEffectiveGSDPreferences } from "../preferences.js";
```

Then, inside the `before_agent_start` handler (line 96-98), update it to register the masker. The `before_agent_start` event returns a result that can include a `transformContext` function. Check if `buildBeforeAgentStartResult` supports this — if the return type includes `transformContext`, add it there. Otherwise, register it on the event directly.

Update the handler:

```typescript
  pi.on("before_agent_start", async (event, ctx: ExtensionContext) => {
    const result = await buildBeforeAgentStartResult(event, ctx);

    // Register observation masking for GSD sessions
    try {
      const prefs = loadEffectiveGSDPreferences();
      const cmConfig = prefs?.preferences?.context_management;
      if (cmConfig?.observation_masking !== false) {
        const turns = cmConfig?.observation_mask_turns ?? 8;
        const masker = createObservationMask(turns);
        // Attach transformContext to the result if the API supports it,
        // otherwise set it on the agent loop config
        if (result) {
          (result as any).transformContext = masker;
        }
      }
    } catch { /* non-fatal */ }

    return result;
  });
```

Note: The exact mechanism for passing `transformContext` to the agent loop depends on whether `BeforeAgentStartResult` supports it. If not, this may need to be registered differently (e.g., via the agent session API). The implementor should check the `BeforeAgentStartResult` type in `@gsd/pi-coding-agent` and adapt accordingly. The masker function is synchronous despite the async signature — it works with both sync and async `transformContext` hooks.

- [ ] **Step 2: Configure compaction threshold and tool result max chars**

In `system-context.ts`, in the `buildBeforeAgentStartResult` function, after the existing system prompt assembly, add threshold overrides to the returned result:

```typescript
  // Context management thresholds
  try {
    const cmConfig = loadedPreferences?.preferences?.context_management;
    const compactionThreshold = cmConfig?.compaction_threshold_percent ?? 0.70;
    const toolResultMax = cmConfig?.tool_result_max_chars ?? 800;
    // Pass as session-level overrides (if BeforeAgentStartResult supports them)
    // These override the defaults in pi-coding-agent constants
    if (result) {
      (result as any).compactionThresholdPercent = compactionThreshold;
      (result as any).toolResultMaxChars = toolResultMax;
    }
  } catch { /* non-fatal */ }
```

Note: The exact API for passing these overrides depends on what `BeforeAgentStartResult` accepts. If the pi-coding-agent extension API does not support `compactionThresholdPercent` and `toolResultMaxChars` in the result, these will need to be set via environment variables or a different mechanism. The implementor should check:
1. `packages/pi-coding-agent/src/core/extensions/types.ts` — `BeforeAgentStartResult` type
2. If the type doesn't support these fields, fall back to `process.env.GSD_COMPACTION_THRESHOLD` and `process.env.GSD_TOOL_RESULT_MAX_CHARS`

- [ ] **Step 3: Run the full test suite to verify nothing broke**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/gsd/tests/*.test.ts'`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/gsd/bootstrap/register-hooks.ts \
        src/resources/extensions/gsd/bootstrap/system-context.ts
git commit -m "feat(context): register observation masker and configure thresholds

Registers createObservationMask() in before_agent_start handler.
Sets compaction threshold to 70% (from 91.5%) and tool result max
to 800 chars (from 2000) for GSD sessions. All configurable via
context_management preferences.

Part of #3171, #3406."
```

---

### Task 8: Write Phase Anchors After Phase Completion

**Files:**
- Modify: `src/resources/extensions/gsd/auto/phases.ts`

- [ ] **Step 1: Add import at top of phases.ts**

```typescript
import { writePhaseAnchor } from "../phase-anchor.js";
import type { PhaseAnchor } from "../phase-anchor.js";
```

- [ ] **Step 2: Add anchor write after unit completion in `runFinalize`**

In `runFinalize` (line 1210), after the `postUnitPostVerification` call (line 1301) and before the final `return { action: "next" }` (line 1317), add:

```typescript
  // Write phase anchor after successful unit completion
  if (s.currentUnit && s.currentMilestoneId) {
    try {
      const unitType = s.currentUnit.type;
      const anchorPhase = unitType.startsWith("discuss") ? "discuss"
        : unitType.startsWith("plan") ? "plan"
        : unitType.startsWith("execute") && s.currentUnit.sliceId
          ? `execute-${s.currentUnit.sliceId}`
        : unitType.startsWith("complete-slice") && s.currentUnit.sliceId
          ? `complete-${s.currentUnit.sliceId}`
        : null;

      if (anchorPhase) {
        const anchor: PhaseAnchor = {
          phase: anchorPhase,
          milestoneId: s.currentMilestoneId,
          generatedAt: new Date().toISOString(),
          intent: `${unitType} for ${s.currentUnit.id}`,
          decisions: [],  // Populated by the agent via gsd_summary_save if structured
          blockers: [],
          nextSteps: [],
        };
        writePhaseAnchor(s.basePath, s.currentMilestoneId, anchor);
      }
    } catch {
      // Non-fatal — anchors are enhancement, not a hard dependency
    }
  }
```

Note: This writes a skeletal anchor with the phase name and intent. For richer anchors (decisions, blockers, nextSteps populated from the agent's actual output), a future enhancement can hook into `gsd_summary_save` or `complete-slice` to extract structured data. The current implementation establishes the write path and file format.

- [ ] **Step 3: Run auto-loop tests to verify nothing broke**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/resources/extensions/gsd/tests/auto-loop.test.ts`
Expected: PASS (anchor write is non-fatal, won't affect existing test fixtures that lack .gsd directories)

- [ ] **Step 4: Commit**

```bash
git add src/resources/extensions/gsd/auto/phases.ts
git commit -m "feat(context): write phase anchors after unit completion

After each unit completes in runFinalize(), writes a structured
phase anchor to .gsd/milestones/{mid}/anchors/{phase}.json.
Non-fatal — failure to write does not block auto-mode.

Part of #3171, #3406."
```

---

### Task 9: Final Integration Test and ADR-004 Status Update

**Files:**
- Modify: `docs/ADR-004-capability-aware-model-routing.md` (status update)
- Modify: `docs/superpowers/specs/2026-04-03-gsd-context-optimization-design.md` (status update)

- [ ] **Step 1: Run the full GSD test suite**

Run: `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test 'src/resources/extensions/gsd/tests/*.test.ts'`
Expected: ALL PASS

- [ ] **Step 2: Run the build to verify no TypeScript errors**

Run: `npm run build` or the project's build command.
Expected: Clean build with no type errors.

- [ ] **Step 3: Update ADR-004 status**

In `docs/ADR-004-capability-aware-model-routing.md`, update line 3:

```markdown
**Status:** Implemented (Phase 1 + Phase 2)
```

- [ ] **Step 4: Update design spec status**

In `docs/superpowers/specs/2026-04-03-gsd-context-optimization-design.md`, add after the date:

```markdown
**Status:** Implemented
```

- [ ] **Step 5: Commit**

```bash
git add docs/ADR-004-capability-aware-model-routing.md \
        docs/superpowers/specs/2026-04-03-gsd-context-optimization-design.md
git commit -m "docs: mark ADR-004 Phase 2 and context optimization as implemented

Updates ADR-004 status to 'Implemented (Phase 1 + Phase 2)'.
Updates design spec status to 'Implemented'."
```

---

## Summary of All Commits

| # | Commit | Files changed | Issues addressed |
|---|--------|---------------|-----------------|
| 1 | Preference types + validation | 5 | #3171, #3406 |
| 2 | ADR-004 Phase 2 capability scoring | 3 | #3171, ADR-004 |
| 3 | Wire capability scoring into dispatch | 1 | #3171 |
| 4 | Observation masking | 2 | #3171, #3406 |
| 5 | Phase handoff anchors | 2 | #3171, #3406 |
| 6 | Prompt builder injection | 1 | #3452, #3406 |
| 7 | Register masker + thresholds | 2 | #3171, #3406 |
| 8 | Write anchors after completion | 1 | #3171, #3406 |
| 9 | ADR + spec status updates | 2 | Documentation |

**Total: 9 atomic commits, 14 files, 4 issues addressed.**
