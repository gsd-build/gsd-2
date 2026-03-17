# Refactor: `/gsd <cmd>` → `/<cmd>` — Top-Level Command Registration

## Goal

Replace the monolithic `/gsd` command (single `registerCommand("gsd")` with a giant if/else router) with individual top-level commands (`/auto`, `/status`, `/next`, etc.). Keep `/gsd` as a lightweight alias for the wizard/step-mode entry point.

---

## Architecture Overview

### Current State
- **One command**: `pi.registerCommand("gsd", ...)` in `commands.ts:79`
- **One handler**: `handler(args)` at line 226 with 30+ `if/else` branches
- **One completions function**: `getArgumentCompletions(prefix)` at lines 81-223
- **~245 references** in `.md` files, **~91 references** in `.ts` files

### Target State
- **30+ individual commands**: Each subcommand becomes `pi.registerCommand("<name>", ...)`
- **`/gsd` kept as alias**: Routes to step-mode wizard (same as bare `/gsd` today)
- **Each command owns its completions**: Only commands with sub-args need completions
- **All docs/prompts updated**: `/gsd auto` → `/auto` everywhere

---

## Namespace Collision Analysis

Commands that could collide with future Pi-core or other extension commands:

| Command | Risk | Mitigation |
|---------|------|------------|
| `/status` | Medium — generic name | Accept; GSD is the primary extension |
| `/stop` | Medium — generic name | Accept; contextual to auto-mode |
| `/mode` | Low | Accept |
| `/config` | Medium — could conflict with Pi config | Accept; only sets API keys |
| `/export` | Low | Accept |
| `/inspect` | Low | Accept |
| `/history` | Low | Accept |
| `/help` | **None** — verified no collision exists | Use `/help` directly |
| `/pause` | Low | Accept |
| `/next` | Low | Accept |

**Decision needed**: What to do about `/help` — likely conflicts with Pi built-in. Recommend keeping it as `/gsd help` or renaming to `/commands`.

---

## Phase Breakdown

### Phase 1: Extract Handler Functions (Code-Only, No Behavior Change)
**Goal**: Move every inline handler out of the monolithic `commands.ts` into importable functions, each with a consistent signature. This phase changes ZERO user-facing behavior.

#### 1.1 Create `src/resources/extensions/gsd/command-handlers.ts`

Extract the 20 inline handlers currently defined inside `commands.ts` into standalone exported functions. Each gets the signature:

```typescript
export async function handleXxx(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void>
```

**Inline handlers to extract (with current line numbers in commands.ts):**

| Function | Current Location | Notes |
|----------|-----------------|-------|
| `showHelp()` | Line 592 | No args |
| `handleStatus()` | Line 637 | Creates dashboard overlay |
| `handleVisualize()` | Line 668 | Creates visualizer overlay |
| `handlePrefs()` | Line 690 | Routes to sub-wizards |
| `handleImportClaude()` | Line 748 | Part of prefs flow |
| `handlePrefsMode()` | Line 779 | Mode selection |
| `handleDoctor()` | Line 809 | Routes to fix/heal/audit |
| `handleInspect()` | Line 884 | SQLite diagnostics |
| `handleSkillHealth()` | Line 934 | Skill lifecycle dashboard |
| `handlePrefsWizard()` | Line 1392 | Full preferences wizard |
| `handleConfig()` | Line 1585 | API key management |
| `handleSkip()` | Line 1658 | Skip unit from dispatch |
| `handleDryRun()` | Line 1706 | Dry-run next |
| `handleCleanupBranches()` | Line 1784 | Git branch cleanup |
| `handleCleanupSnapshots()` | Line 1825 | Snapshot cleanup |
| `handleKnowledge()` | Line 1861 | Add rule/pattern/lesson |
| `handleCapture()` | Line 1897 | Quick thought capture |
| `handleTriage()` | Line 1932 | Classify pending captures |
| `handleSteer()` | Line 1986 | Override plan documents |
| `handleRunHook()` | Line 2029 | Manual hook trigger |

**Already-external handlers (no extraction needed):**

| Handler | Module |
|---------|--------|
| `startAuto()` | `./auto.js` |
| `stopAuto()`, `pauseAuto()`, `stopAutoRemote()` | `./auto.js` |
| `dispatchDirectPhase()` | `./auto.js` |
| `handleHistory()` | `./history.js` |
| `handleUndo()` | `./undo.js` |
| `handleExport()` | `./export.js` |
| `handleQuick()` | `./quick.js` |
| `showQueue()`, `showDiscuss()`, `showHeadlessMilestoneCreation()` | `./guided-flow.js` |
| `handleRemote()` | `../remote-questions/remote-command.js` |
| `handleMigrate()` | `./migrate/command.js` (dynamic import) |
| `handleForensics()` | `./forensics.js` (dynamic import) |

#### 1.2 Update `commands.ts` to import from `command-handlers.ts`

Replace all inline function definitions with imports. The if/else router stays the same — it just calls imported functions now. **Verify no behavior change.**

#### 1.3 Tests

- Run existing test suite to confirm no regressions
- The `gsd-inspect.test.ts` imports `formatInspectOutput` from `commands.ts` — ensure it still exports correctly

---

### Phase 2: Split Registration — Individual `registerCommand()` Calls
**Goal**: Replace the single `registerCommand("gsd")` with individual `registerCommand()` calls per subcommand.

#### 2.1 Create `src/resources/extensions/gsd/register-commands.ts`

New file that exports a single function:

```typescript
export function registerAllCommands(pi: ExtensionAPI): void {
  // Keep /gsd as the wizard entry point
  pi.registerCommand("gsd", {
    description: "GSD wizard — contextual step-mode entry point",
    handler: async (args, ctx) => {
      // If bare /gsd → step mode wizard
      // If /gsd <subcmd> → show deprecation hint + forward to handler
      // This provides backward compatibility
    }
  });

  // Individual top-level commands
  pi.registerCommand("auto", {
    description: "Start autonomous execution mode",
    getArgumentCompletions: (prefix) => {
      return ["--verbose", "--debug"]
        .filter(f => f.startsWith(prefix))
        .map(f => ({ value: f, label: f }));
    },
    handler: async (args, ctx) => { /* ... */ }
  });

  pi.registerCommand("next", { ... });
  pi.registerCommand("stop", { ... });
  pi.registerCommand("pause", { ... });
  pi.registerCommand("status", { ... });
  pi.registerCommand("visualize", { ... });
  // ... etc for all 30 commands
}
```

#### 2.2 Full Command Registration Table

| New Command | Old Form | Has Completions? | Completion Values |
|-------------|----------|------------------|-------------------|
| `/auto` | `/gsd auto` | Yes | `--verbose`, `--debug` |
| `/next` | `/gsd next` | Yes | `--verbose`, `--dry-run` |
| `/stop` | `/gsd stop` | No | — |
| `/pause` | `/gsd pause` | No | — |
| `/status` | `/gsd status` | No | — |
| `/visualize` | `/gsd visualize` | No | — |
| `/queue` | `/gsd queue` | No | — |
| `/quick` | `/gsd quick` | No | — |
| `/discuss` | `/gsd discuss` | No | — |
| `/capture` | `/gsd capture` | No | — |
| `/triage` | `/gsd triage` | No | — |
| `/dispatch` | `/gsd dispatch` | Yes | `research`, `plan`, `execute`, `complete`, `reassess`, `uat`, `replan` |
| `/history` | `/gsd history` | Yes | `--cost`, `--phase`, `--model`, `10`, `20`, `50` |
| `/undo` | `/gsd undo` | Yes | `--force` |
| `/skip` | `/gsd skip` | No | — |
| `/export` | `/gsd export` | Yes | `--json`, `--markdown` |
| `/cleanup` | `/gsd cleanup` | Yes | `branches`, `snapshots` |
| `/mode` | `/gsd mode` | Yes | `global`, `project` |
| `/prefs` | `/gsd prefs` | Yes | `global`, `project`, `status`, `wizard`, `setup`, `import-claude` |
| `/config` | `/gsd config` | No | — |
| `/hooks` | `/gsd hooks` | No | — |
| `/run-hook` | `/gsd run-hook` | No | — |
| `/skill-health` | `/gsd skill-health` | No | — |
| `/doctor` | `/gsd doctor` | Yes | `fix`, `heal`, `audit` |
| `/forensics` | `/gsd forensics` | No | — |
| `/inspect` | `/gsd inspect` | No | — |
| `/migrate` | `/gsd migrate` | No | — |
| `/remote` | `/gsd remote` | Yes | `slack`, `discord`, `status`, `disconnect` |
| `/steer` | `/gsd steer` | No | — |
| `/knowledge` | `/gsd knowledge` | Yes | `rule`, `pattern`, `lesson` |
| `/new-milestone` | `/gsd new-milestone` | No | — |
| `/parallel` | `/gsd parallel` | Yes | `start`, `status`, `stop`, `pause`, `resume`, `merge` |

#### 2.3 Backward Compatibility in `/gsd`

The `/gsd` handler should:
1. If bare `/gsd` → run step-mode wizard (current behavior)
2. If `/gsd <known-subcmd>` → run the handler BUT also print a one-time deprecation notice:
   ```
   Hint: /gsd auto is now just /auto
   ```
3. This lets existing muscle memory work while guiding users to the new syntax

#### 2.4 Update `index.ts`

Replace:
```typescript
registerGSDCommand(pi);
```
With:
```typescript
registerAllCommands(pi);
```

#### 2.5 Tests

- Write a registration test that verifies all expected command names are registered
- Write a backward-compat test that verifies `/gsd auto` still works and shows deprecation hint
- Update `exit-command.test.ts` if it references the old pattern

---

### Phase 3: Update TypeScript References (~91 occurrences across ~30 files)
**Goal**: Update all user-facing strings in `.ts` files from `/gsd <cmd>` to `/<cmd>`.

#### 3.1 Critical Functional Code (Must Change)

These are **not just strings** — they affect runtime behavior:

| File | Line | Current | Change To | Why Critical |
|------|------|---------|-----------|--------------|
| `parallel-orchestrator.ts` | 410 | `"/gsd auto"` in spawn args | `"/auto"` | Worker process spawns with this command |
| `headless.ts` | 639 | `` `/gsd ${options.command}` `` | `/${options.command}` or route correctly | Dynamic command construction |
| `headless.ts` | 667 | `'/gsd auto'` | `'/auto'` | Direct prompt call |
| `auto.ts` | 805 | `"/gsd next"` / `"/gsd auto"` | `"/next"` / `"/auto"` | Resume command variable |
| `workspace-index.ts` | 210-215 | `"/gsd"`, `"/gsd auto"`, etc. | `"/auto"`, `"/doctor"`, etc. | Programmatic command suggestions |

#### 3.2 User-Facing String Updates (By File)

**High-touch files (10+ references each):**

| File | Ref Count | Types of References |
|------|-----------|-------------------|
| `commands.ts` | 25+ | Help text, error messages, usage hints |
| `auto.ts` | 14+ | Notifications, comments, resume commands |
| `guided-flow.ts` | 23+ | `notYetMessage` UI strings, comments, labels |

**Medium-touch files (3-10 references each):**

| File | Ref Count | Types |
|------|-----------|-------|
| `git-self-heal.ts` | 8 | Error message templates |
| `remote-command.ts` | 11 | Usage messages, file header |
| `onboarding.ts` | 6 | Onboarding UI messages |
| `index.ts` | 4 | Shortcut descriptions, comments |
| `help-text.ts` | 3 | CLI help text |
| `headless.ts` | 5 | Functional code + logs |
| `workspace-index.ts` | 5 | Command suggestions |
| `dashboard-overlay.ts` | 3 | UI display messages |
| `vscode chat-participant.ts` | 3 | Quick action prompts |

**Low-touch files (1-2 references each):**

| File | Ref Count |
|------|-----------|
| `auto-dispatch.ts` | 3 |
| `doctor-proactive.ts` | 2 |
| `undo.ts` | 1 |
| `quick.ts` | 2 |
| `parallel-merge.ts` | 1 |
| `migrate/command.ts` | 3 |
| `migrate/writer.ts` | 1 |
| `forensics.ts` | 1 |
| `worktree-command.ts` | 2 |
| `state.ts` | 1 |
| `doctor.ts` | 1 |
| `triage-ui.ts` | 1 |
| `post-unit-hooks.ts` | 1 |
| `reports.ts` | 2 |
| `update-check.ts` | 1 |

#### 3.3 Test File Updates

| Test File | References |
|-----------|------------|
| `tests/headless-detection.test.ts` | 1 |
| `tests/auto-draft-pause.test.ts` | TBD |
| `tests/gsd-inspect.test.ts` | TBD |
| `tests/git-self-heal.test.ts` | TBD |
| `tests/parallel-orchestration.test.ts` | TBD |
| `tests/undo.test.ts` | TBD |
| `tests/workspace-index.test.ts` | TBD |

#### 3.4 Execution Strategy

1. Use find-and-replace with manual review for each file
2. **Do NOT blindly replace** — some references are to the `/gsd` wizard itself (keep as `/gsd`)
3. Pattern: Replace `/gsd <word>` with `/<word>` but keep bare `/gsd` as-is
4. Run full test suite after each batch of files

---

### Phase 4: Update Markdown/Documentation (~245 occurrences across ~30 files)
**Goal**: Update all docs, prompts, and reference files.

#### 4.1 Core Documentation (docs/)

| File | Ref Count | Priority |
|------|-----------|----------|
| `docs/commands.md` | 34 | **P0** — primary command reference |
| `docs/parallel-orchestration.md` | 27 | P0 |
| `README.md` | 47 | **P0** — first thing users see |
| `docs/troubleshooting.md` | 10 | P1 |
| `docs/configuration.md` | 12 | P1 |
| `docs/getting-started.md` | ~10 | P1 |
| `docs/auto-mode.md` | ~12 | P1 |
| `docs/cost-management.md` | ~4 | P2 |
| `docs/skills.md` | ~5 | P2 |
| `docs/captures-triage.md` | ~5 | P2 |
| `docs/migration.md` | ~4 | P2 |
| `docs/remote-questions.md` | ~6 | P2 |
| `docs/visualizer.md` | 1 | P2 |
| `docs/git-strategy.md` | 1 | P2 |
| `docs/README.md` | 1 | P2 |
| `docs/ADR-001-*.md` | 1 | P3 |
| `CHANGELOG.md` | 15+ | **Skip** — historical record, don't change |

#### 4.2 Prompt Files (src/resources/extensions/gsd/prompts/)

These are **injected into LLM context** — critical to update so the AI suggests correct commands:

| File | Ref Count |
|------|-----------|
| `prompts/system.md` | 9 |
| `prompts/discuss.md` | 1 |
| `prompts/forensics.md` | 3 |
| `prompts/doctor-heal.md` | 1 |
| `prompts/triage-captures.md` | 1 |
| `prompts/run-uat.md` | 1 |
| `prompts/review-migration.md` | 1 |
| `prompts/execute-task.md` | 2 |
| `prompts/plan-slice.md` | 2 |

#### 4.3 Skill Reference Files

| File | Ref Count |
|------|-----------|
| `skills/gsd-headless/references/multi-session.md` | 8 |

#### 4.4 Extension Docs

| File | Ref Count |
|------|-----------|
| `gsd/docs/claude-marketplace-import.md` | 4 |
| `gsd/docs/preferences-reference.md` | 2 |
| `gsd/templates/preferences.md` | 1 |

#### 4.5 VS Code Extension

| File | Ref Count |
|------|-----------|
| `vscode-extension/README.md` | 5 |

#### 4.6 Workflow File

| File | Ref Count |
|------|-----------|
| `src/resources/GSD-WORKFLOW.md` | 2 |

#### 4.7 Plan Files

| File | Action |
|------|--------|
| `.plans/issue-575-dynamic-model-routing.md` | Update (uses `/gsd:rate-unit`) |
| `.plans/tui-dashboard-cleanup.md` | Update |
| `.plans/native-perf-optimizations.md` | Update |

---

### Phase 5: Validation & Cleanup
**Goal**: Ensure nothing is broken and no references were missed.

#### 5.1 Automated Checks

```bash
# Find any remaining /gsd <word> references (should only find bare /gsd and CHANGELOG)
grep -rn '/gsd [a-z]' src/ docs/ --include='*.ts' --include='*.md' | grep -v CHANGELOG | grep -v node_modules

# Run full test suite
npm test

# Build
npm run build

# Lint
npm run lint
```

#### 5.2 Manual Smoke Tests

1. `/auto` starts auto-mode
2. `/stop` stops it
3. `/status` shows dashboard
4. `/gsd` shows wizard (backward compat)
5. `/gsd auto` works with deprecation hint
6. `/parallel start` works
7. `/doctor` runs health checks
8. `/prefs wizard` opens wizard
9. Headless mode: `gsd --print "/auto"` works
10. VS Code chat participant quick actions work

#### 5.3 Grep Audit

Run a final grep to ensure no `/gsd <subcmd>` patterns remain outside of:
- `CHANGELOG.md` (historical, don't touch)
- The backward-compat router in `/gsd` handler
- Any intentional references to the product name "GSD" (not command syntax)

---

## Estimated Scope

| Phase | Files Modified | Effort |
|-------|---------------|--------|
| Phase 1: Extract handlers | 2 files (commands.ts + new command-handlers.ts) | Medium |
| Phase 2: Split registration | 3 files (register-commands.ts + commands.ts + index.ts) | Medium |
| Phase 3: Update TS refs | ~30 files, ~91 references | Medium-High |
| Phase 4: Update MD refs | ~30 files, ~245 references | Medium (mostly mechanical) |
| Phase 5: Validation | 0 new files | Low |

**Total**: ~60 files touched, ~336 references updated

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `/help` collides with Pi built-in | Users can't access GSD help | **Resolved**: No collision exists; using `/help` |
| Headless mode breaks | CI/automation fails | Phase 3 specifically addresses `headless.ts` functional code |
| Parallel workers break | Worker spawning fails | Phase 3 specifically addresses `parallel-orchestrator.ts` spawn args |
| LLM suggests old `/gsd auto` syntax | Bad UX | Phase 4 updates all prompt files injected into LLM context |
| Backward compat overhead | Old docs/tutorials broken | Phase 2 keeps `/gsd <subcmd>` working with deprecation hint |
| CHANGELOG editing | Destroys historical record | Explicitly skipped — don't modify CHANGELOG |

---

## Decisions (Resolved)

1. **`/help`**: Use `/help` — no collision exists in Pi core or any extension. GSD owns the full stack so future conflicts are controllable.
2. **Backward compat**: Keep `/gsd <subcmd>` working permanently. Show a one-time deprecation hint pointing to the new top-level command.
3. **`/gsd` bare command**: Keep `/gsd` as the wizard/step-mode entry point. It's the brand name and a natural "start here."
4. **VS Code extension**: Update in the same PR — same phase of work.
