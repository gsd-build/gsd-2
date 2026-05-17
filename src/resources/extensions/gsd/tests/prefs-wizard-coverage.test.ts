// GSD-2 + prefs-wizard-coverage.test.ts - Behavioral coverage for preferences wizard persistence.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildCategorySummaries, handlePrefsWizard } from "../commands-prefs-wizard.ts";
import { KNOWN_PREFERENCE_KEYS } from "../preferences-types.ts";

const PREF_SAMPLE_VALUES: Record<string, unknown> = {
  version: 1,
  mode: "team",
  always_use_skills: ["debug-like-expert"],
  prefer_skills: ["typescript-expert"],
  avoid_skills: ["slow-skill"],
  skill_rules: [{ when: "unit:execute-task", use: ["test-writer-fixer"] }],
  custom_instructions: ["Keep changes focused."],
  models: { execution: "openai/gpt-5" },
  skill_discovery: "auto",
  skill_staleness_days: 7,
  auto_supervisor: { soft_timeout_minutes: 20, idle_timeout_minutes: 10, hard_timeout_minutes: 30 },
  uat_dispatch: true,
  unique_milestone_ids: true,
  budget_ceiling: 12.5,
  budget_enforcement: "warn",
  context_pause_threshold: 0.8,
  notifications: {
    enabled: true,
    on_complete: true,
    on_error: true,
    on_budget: true,
    on_milestone: true,
    on_attention: true,
  },
  cmux: { enabled: true },
  remote_questions: { provider: "slack", channel: "C123" },
  git: {
    auto_push: false,
    push_branches: true,
    pre_merge_check: true,
    merge_strategy: "squash",
    isolation: "worktree",
    main_branch: "main",
    absorb_snapshot_commits: true,
  },
  post_unit_hooks: [{ command: "npm test" }],
  pre_dispatch_hooks: [{ command: "npm run lint" }],
  dynamic_routing: { enabled: true },
  disabled_model_providers: ["slow-provider"],
  uok: { enabled: true },
  token_profile: "standard",
  phases: { progressive_planning: true },
  auto_visualize: true,
  auto_report: true,
  parallel: { enabled: true, max_workers: 2 },
  verification_commands: ["npm test"],
  verification_auto_fix: true,
  verification_max_retries: 1,
  per_unit_cost_cap_usd: 5,
  search_provider: "web",
  context_selection: "auto",
  widget_mode: "small",
  reactive_execution: { enabled: true },
  gate_evaluation: { enabled: true },
  github: { enabled: true },
  service_tier: "default",
  forensics_dedup: true,
  show_token_cost: true,
  min_request_interval_ms: 250,
  stale_commit_threshold_minutes: 15,
  context_management: { enabled: true },
  experimental: { rtk: true },
  codebase: { indexing: "auto" },
  slice_parallel: { enabled: true, max_workers: 2 },
  safety_harness: { enabled: true },
  enhanced_verification: true,
  enhanced_verification_pre: true,
  enhanced_verification_post: true,
  enhanced_verification_strict: false,
  discuss_preparation: true,
  discuss_web_research: true,
  discuss_depth: "standard",
  flat_rate_providers: ["openai"],
  language: "en",
  context_window_override: 128000,
  context_mode: { enabled: true },
  planning_depth: "deep",
  claude_code_mcp: { per_model: { "claude-haiku": { allowed_servers: ["gsd-workflow"] } } },
  workspace: {
    mode: "parent",
    repositories: {
      frontend: {
        path: "frontend",
        role: "web UI",
        verification: ["npm test"],
      },
    },
  },
};

test("prefs wizard save path preserves every known preference key", async () => {
  const missingSamples = [...KNOWN_PREFERENCE_KEYS].filter((key) => !(key in PREF_SAMPLE_VALUES));
  assert.deepEqual(missingSamples, [], "test fixture must cover every known preference key");

  const dir = mkdtempSync(join(tmpdir(), "gsd-prefs-wizard-"));
  const prefsPath = join(dir, "PREFERENCES.md");
  const choices = ["── Save & Exit ──"];
  const ctx = {
    ui: {
      notify() {},
      select: async () => choices.shift(),
    },
    waitForIdle: async () => {},
    reload: async () => {},
  } as any;

  try {
    await handlePrefsWizard(ctx, "project", PREF_SAMPLE_VALUES, { pathOverride: prefsPath });
    const saved = readFileSync(prefsPath, "utf-8");
    const missingPersisted = [...KNOWN_PREFERENCE_KEYS].filter((key) => !saved.includes(`${key}:`));
    assert.deepEqual(missingPersisted, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("category summaries expose the wizard menu surface for configured prefs", () => {
  const summaries = buildCategorySummaries(PREF_SAMPLE_VALUES);
  assert.deepEqual(
    Object.keys(summaries).sort(),
    [
      "advanced",
      "budget",
      "context",
      "discuss",
      "git",
      "hooks",
      "integrations",
      "mode",
      "models",
      "notifications",
      "parallelism",
      "phases",
      "skills",
      "timeouts",
      "uok",
      "verification",
    ],
  );
  assert.match(summaries.models, /phase/);
  assert.match(summaries.integrations, /remote: C123/);
  assert.match(summaries.verification, /1 cmd/);
});

test("models wizard offers discovered models for enabled providers", async () => {
  const dir = mkdtempSync(join(tmpdir(), "gsd-prefs-wizard-"));
  const prefsPath = join(dir, "PREFERENCES.md");
  const choices = [
    "Models",
    "local (2 models)",
    "discovered-model",
    "(keep current)",
    "(keep current)",
    "(keep current)",
    "(keep current)",
    "(keep current)",
    "(keep current)",
    "(keep current)",
  ];
  const ctx = {
    // `getAllWithDiscovered` reads `this._all` so the wizard must call it as a
    // method — invoking a detached reference would lose `this` and throw,
    // mirroring the real ModelRegistry implementation.
    modelRegistry: {
      _all: [
        { provider: "local", id: "baseline-model" },
        { provider: "local", id: "discovered-model" },
        { provider: "disabled", id: "hidden-model" },
      ],
      getAvailable() {
        return [{ provider: "local", id: "baseline-model" }];
      },
      getAllWithDiscovered() {
        return this._all;
      },
    },
    ui: {
      notify() {},
      select: async (label: string, options: string[]) => {
        const choice = choices.shift();
        if (!choice && label === "GSD Preferences") return "── Save & Exit ──";
        if (!choice && options.includes("(keep current)")) return "(keep current)";
        if (!choice && options.includes("Done")) return "Done";
        assert.ok(choice, `Unexpected prompt: ${label}`);
        if (choice === "Models") {
          const modelsOption = options.find((option) => option.startsWith("Models"));
          assert.ok(modelsOption, "Expected Models category option");
          return modelsOption;
        }
        assert.ok(options.includes(choice), `"${choice}" must be offered by "${label}"`);
        assert.ok(!options.includes("hidden-model"), "models from disabled providers must not be offered");
        return choice;
      },
      input: async () => null,
    },
    waitForIdle: async () => {},
    reload: async () => {},
  } as any;

  try {
    await handlePrefsWizard(ctx, "project", {}, { pathOverride: prefsPath });

    assert.equal(choices.length, 0, "Expected all queued wizard choices to be consumed");
    const saved = readFileSync(prefsPath, "utf-8");
    assert.match(saved, /research:\s+local\/discovered-model/);
    assert.doesNotMatch(saved, /hidden-model/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
