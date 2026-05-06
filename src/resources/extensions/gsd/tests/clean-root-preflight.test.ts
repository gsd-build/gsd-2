/**
 * clean-root-preflight.test.ts — Regression tests for #2909.
 *
 * Tests that preflightCleanRoot warns + stashes on dirty trees,
 * is a no-op on clean trees, and that postflightPopStash restores
 * stashed changes after a merge.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

import { preflightCleanRoot, postflightPopStash } from "../clean-root-preflight.ts";
import { _resetHasChangesCache, nativeHasChanges } from "../native-git-bridge.ts";

function run(cmd: string, cwd: string): string {
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf-8" }).trim();
}

function createTempRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-preflight-test-")));
  run("git init", dir);
  run("git config user.email test@example.com", dir);
  run("git config user.name Test", dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  writeFileSync(join(dir, ".gsd", "STATE.md"), "# State\n");
  run("git add .", dir);
  run("git commit -m init", dir);
  run("git branch -M main", dir);
  return dir;
}

// ── Clean tree: fast-path returns immediately without stashing ─────────────

test("preflightCleanRoot — clean tree returns stashPushed=false and emits no notifications", () => {
  const repo = createTempRepo();
  try {
    const notifications: Array<{ msg: string; level: string }> = [];
    const result = preflightCleanRoot(repo, "M001", (msg, level) => {
      notifications.push({ msg, level });
    });

    assert.equal(result.stashPushed, false, "stashPushed must be false for clean tree");
    assert.equal(result.summary, "", "summary must be empty for clean tree");
    assert.equal(notifications.length, 0, "no notifications on clean tree");

    // Verify no stash was created
    const stashList = run("git stash list", repo);
    assert.equal(stashList, "", "no stash entry on clean tree");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

// ── Dirty tree: warns, stashes, returns stashPushed=true ──────────────────

test("preflightCleanRoot — dirty tree warns user and auto-stashes", () => {
  const repo = createTempRepo();
  try {
    // Dirty an existing tracked file
    writeFileSync(join(repo, "README.md"), "# locally modified\n");

    const notifications: Array<{ msg: string; level: string }> = [];
    const result = preflightCleanRoot(repo, "M002", (msg, level) => {
      notifications.push({ msg, level });
    });

    assert.equal(result.stashPushed, true, "stashPushed must be true when tree was dirty");
    assert.ok(result.summary.length > 0, "summary must be non-empty when stash was pushed");

    // A warning notification must have been emitted before stashing
    assert.ok(
      notifications.some(n => n.level === "warning" && n.msg.includes("M002")),
      "warning notification must mention the milestone ID",
    );

    // Working tree must now be clean (stash pushed)
    const status = run("git status --porcelain", repo);
    assert.equal(status, "", "working tree must be clean after stash push");

    // The stash entry must exist
    const stashList = run("git stash list", repo);
    assert.ok(stashList.includes("gsd-preflight-stash"), "stash entry must be named gsd-preflight-stash");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

// ── Untracked files are also stashed ─────────────────────────────────────

test("preflightCleanRoot — untracked file triggers stash with --include-untracked", () => {
  const repo = createTempRepo();
  try {
    // Add an untracked file
    writeFileSync(join(repo, "untracked.ts"), "export const x = 1;\n");

    const notifications: Array<{ msg: string; level: string }> = [];
    const result = preflightCleanRoot(repo, "M003", (msg, level) => {
      notifications.push({ msg, level });
    });

    assert.equal(result.stashPushed, true, "stashPushed must be true for untracked file");

    const status = run("git status --porcelain", repo);
    assert.equal(status, "", "working tree must be clean after stash push");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

// ── postflightPopStash: restores stashed changes ──────────────────────────

test("postflightPopStash — restores stashed changes and emits info notification", () => {
  const repo = createTempRepo();
  try {
    // Dirty the working tree
    writeFileSync(join(repo, "README.md"), "# stash me\n");

    const preNotifications: Array<{ msg: string; level: string }> = [];
    const preflight = preflightCleanRoot(repo, "M004", (msg, level) => {
      preNotifications.push({ msg, level });
    });
    assert.equal(preflight.stashPushed, true, "preflight must have stashed");

    // Simulate the merge (just a no-op commit here)
    writeFileSync(join(repo, "merged.ts"), "export const merged = true;\n");
    run("git add .", repo);
    run('git commit -m "simulate merge"', repo);

    const postNotifications: Array<{ msg: string; level: string }> = [];
    const postflight = postflightPopStash(repo, "M004", preflight.stashMarker, (msg, level) => {
      postNotifications.push({ msg, level });
    });
    assert.equal(postflight.restored, true, "postflight must report successful restore");
    assert.equal(postflight.needsManualRecovery, false, "successful restore must not need manual recovery");

    // The stashed README.md change must be restored
    const content = readFileSync(join(repo, "README.md"), "utf-8");
    assert.equal(content.replace(/\r\n/g, "\n"), "# stash me\n", "stashed file must be restored");

    // An info notification must have been emitted
    assert.ok(
      postNotifications.some(n => n.level === "info" && n.msg.includes("M004")),
      "info notification must mention milestone ID after pop",
    );

    // Stash list must be empty
    const stashList = run("git stash list", repo);
    assert.equal(stashList, "", "stash list must be empty after pop");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

// ── Round-trip: preflight + merge + postflight preserves changes ──────────

test("preflight + merge + postflight round-trip preserves uncommitted changes", () => {
  const repo = createTempRepo();
  try {
    const originalContent = "# my local work\n";
    writeFileSync(join(repo, "README.md"), originalContent);

    // Preflight: stash
    const preflight = preflightCleanRoot(repo, "M005", () => {});
    assert.equal(preflight.stashPushed, true, "must have stashed");

    // Merge: introduce a new file (no overlap with README.md)
    writeFileSync(join(repo, "feature.ts"), "export const feature = true;\n");
    run("git add feature.ts", repo);
    run('git commit -m "feat: add feature"', repo);

    // Postflight: pop stash
    const postflight = postflightPopStash(repo, "M005", preflight.stashMarker, () => {});
    assert.equal(postflight.needsManualRecovery, false, "clean restore must not stop auto-mode");

    // README.md must still have our local content
    const restored = readFileSync(join(repo, "README.md"), "utf-8");
    assert.equal(restored.replace(/\r\n/g, "\n"), originalContent, "local changes must survive merge");

    // feature.ts must also exist (the merge commit landed)
    const featureContent = readFileSync(join(repo, "feature.ts"), "utf-8");
    assert.ok(featureContent.includes("feature"), "merged feature must be present");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash conflict warning names the exact stash ref", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "README.md"), "# local work\n");
    const preflight = preflightCleanRoot(repo, "M005C", () => {});
    assert.equal(preflight.stashPushed, true, "must have stashed");

    writeFileSync(join(repo, "README.md"), "# merged work\n");
    run("git add README.md", repo);
    run('git commit -m "simulate conflicting merge"', repo);

    const notifications: Array<{ msg: string; level: string }> = [];
    const postflight = postflightPopStash(repo, "M005C", preflight.stashMarker, (msg, level) => {
      notifications.push({ msg, level });
    });
    assert.equal(postflight.restored, false, "conflicted restore must report restored=false");
    assert.equal(postflight.needsManualRecovery, true, "conflicted restore must require manual recovery");
    assert.match(postflight.message, /failed after merge of milestone M005C/);

    const warning = notifications.find((n) => n.level === "warning")?.msg ?? "";
    assert.match(warning, /git stash apply stash@\{\d+\}/);
    assert.match(warning, /git stash drop stash@\{\d+\}/);
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash restores the matching GSD stash, not stash@{0}", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "README.md"), "# target stash\n");
    const preflight = preflightCleanRoot(repo, "M006", () => {});
    assert.equal(preflight.stashPushed, true, "must have stashed target change");

    writeFileSync(join(repo, "other.txt"), "other stash\n");
    run('git stash push --include-untracked -m "unrelated newer stash"', repo);

    const postflight = postflightPopStash(repo, "M006", preflight.stashMarker, () => {});
    assert.equal(postflight.needsManualRecovery, false, "targeted restore must not need manual recovery");

    const content = readFileSync(join(repo, "README.md"), "utf-8");
    assert.equal(content.replace(/\r\n/g, "\n"), "# target stash\n");
    const stashList = run("git stash list", repo);
    assert.ok(stashList.includes("unrelated newer stash"), "unrelated newer stash must remain");
    assert.ok(!stashList.includes("gsd-preflight-stash [gsd-preflight-stash:M006"), "target stash should be consumed");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash restores the exact preflight marker when another same-milestone stash exists", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "README.md"), "# target stash\n");
    const preflight = preflightCleanRoot(repo, "M007", () => {});
    assert.equal(preflight.stashPushed, true, "must have stashed target change");
    assert.ok(preflight.stashMarker, "preflight must expose exact stash marker");

    writeFileSync(join(repo, "same-milestone.txt"), "newer same milestone stash\n");
    run('git stash push --include-untracked -m "gsd-preflight-stash [gsd-preflight-stash:M007:other]"', repo);

    const postflight = postflightPopStash(repo, "M007", preflight.stashMarker, () => {});
    assert.equal(postflight.needsManualRecovery, false, "exact marker restore must not need manual recovery");

    const content = readFileSync(join(repo, "README.md"), "utf-8");
    assert.equal(content.replace(/\r\n/g, "\n"), "# target stash\n");
    const stashList = run("git stash list", repo);
    assert.ok(stashList.includes("gsd-preflight-stash:M007:other"), "newer same-milestone stash must remain");
    assert.ok(!stashList.includes(preflight.stashMarker), "exact target stash should be consumed");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash falls back to milestone marker prefix when exact marker is unavailable", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "README.md"), "# fallback stash\n");
    run('git stash push --include-untracked -m "gsd-preflight-stash [gsd-preflight-stash:M008:fallback]"', repo);

    const postflight = postflightPopStash(repo, "M008", undefined, () => {});
    assert.equal(postflight.needsManualRecovery, false, "fallback marker restore must not need manual recovery");

    const content = readFileSync(join(repo, "README.md"), "utf-8");
    assert.equal(content.replace(/\r\n/g, "\n"), "# fallback stash\n");
    const stashList = run("git stash list", repo);
    assert.ok(!stashList.includes("gsd-preflight-stash:M008:fallback"), "fallback stash should be consumed");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash preserves stash when untracked collision differs from merged file", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "tests.txt"), "local preflight test\n");
    const preflight = preflightCleanRoot(repo, "M009", () => {});
    assert.equal(preflight.stashPushed, true, "preflight must stash untracked file");

    writeFileSync(join(repo, "tests.txt"), "merged milestone test\n");
    run("git add tests.txt", repo);
    run('git commit -m "feat: add merged test"', repo);

    const notifications: Array<{ msg: string; level: string }> = [];
    const postflight = postflightPopStash(repo, "M009", preflight.stashMarker, (msg, level) => {
      notifications.push({ msg, level });
    });

    assert.equal(postflight.needsManualRecovery, false, "different already-present untracked files must not stop auto-mode");
    assert.equal(postflight.resolution, "already-present-preserved");
    assert.deepEqual(postflight.collidedPaths, ["tests.txt"]);
    assert.equal(readFileSync(join(repo, "tests.txt"), "utf-8"), "merged milestone test\n");
    assert.equal(run("git status --porcelain", repo), "", "merged file must stay clean");

    const stashList = run("git stash list", repo);
    assert.ok(preflight.stashMarker && stashList.includes(preflight.stashMarker), "stash backup must be preserved");
    assert.ok(
      notifications.some((n) => n.level === "warning" && n.msg.includes("preserving")),
      "user must be warned that the stash was preserved as backup",
    );
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash drops stash when untracked collision is identical to merged file", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "tests.txt"), "same test content\n");
    const preflight = preflightCleanRoot(repo, "M010", () => {});
    assert.equal(preflight.stashPushed, true, "preflight must stash untracked file");

    writeFileSync(join(repo, "tests.txt"), "same test content\n");
    run("git add tests.txt", repo);
    run('git commit -m "feat: add same test"', repo);

    const postflight = postflightPopStash(repo, "M010", preflight.stashMarker, () => {});

    assert.equal(postflight.needsManualRecovery, false, "identical already-present files must not stop auto-mode");
    assert.equal(postflight.resolution, "already-present-dropped");
    assert.equal(readFileSync(join(repo, "tests.txt"), "utf-8"), "same test content\n");

    const stashList = run("git stash list", repo);
    assert.ok(!stashList.includes(preflight.stashMarker ?? ""), "identical stash must be dropped");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash requires manual recovery for mixed tracked changes and untracked collision", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "README.md"), "# local tracked work\n");
    writeFileSync(join(repo, "tests.txt"), "local untracked work\n");
    const preflight = preflightCleanRoot(repo, "M011", () => {});
    assert.equal(preflight.stashPushed, true, "preflight must stash mixed changes");

    writeFileSync(join(repo, "tests.txt"), "merged milestone test\n");
    run("git add tests.txt", repo);
    run('git commit -m "feat: add merged test"', repo);

    const postflight = postflightPopStash(repo, "M011", preflight.stashMarker, () => {});

    assert.equal(postflight.needsManualRecovery, true, "tracked stash payload must still require manual recovery");
    assert.equal(postflight.resolution, "manual-recovery");
    const stashList = run("git stash list", repo);
    assert.ok(preflight.stashMarker && stashList.includes(preflight.stashMarker), "mixed stash must be preserved");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("postflightPopStash requires manual recovery when an untracked stash path is missing after collision", () => {
  const repo = createTempRepo();
  try {
    writeFileSync(join(repo, "tests.txt"), "local untracked work\n");
    writeFileSync(join(repo, "other-tests.txt"), "other local untracked work\n");
    const preflight = preflightCleanRoot(repo, "M012", () => {});
    assert.equal(preflight.stashPushed, true, "preflight must stash untracked files");

    writeFileSync(join(repo, "tests.txt"), "merged milestone test\n");
    run("git add tests.txt", repo);
    run('git commit -m "feat: add one merged test"', repo);

    const postflight = postflightPopStash(repo, "M012", preflight.stashMarker, () => {});

    assert.equal(postflight.needsManualRecovery, true, "partial untracked restores must still require manual recovery");
    assert.equal(postflight.resolution, "manual-recovery");
    assert.equal(existsSync(join(repo, "other-tests.txt")), true, "git may partially restore the non-colliding path");
    assert.match(run("git status --porcelain", repo), /\?\? other-tests\.txt/, "partial restore must leave manual recovery visible");
    const stashList = run("git stash list", repo);
    assert.ok(preflight.stashMarker && stashList.includes(preflight.stashMarker), "stash must remain for manual recovery");
  } finally {
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});

test("preflightCleanRoot does not claim stashPushed when cached dirty state is stale (#5424)", () => {
  const repo = createTempRepo();
  try {
    _resetHasChangesCache();

    // Seed the 10s hasChanges cache with a dirty=true result.
    writeFileSync(join(repo, "README.md"), "# dirty then clean\n");
    assert.equal(nativeHasChanges(repo), true, "cache seed should observe dirty tree");

    // Immediately clean the tree before preflight runs. The cache remains true.
    run("git checkout -- README.md", repo);
    assert.equal(run("git status --porcelain", repo), "", "working tree should be clean before preflight");

    const notifications: Array<{ msg: string; level: string }> = [];
    const result = preflightCleanRoot(repo, "M5424", (msg, level) => {
      notifications.push({ msg, level });
    });

    assert.equal(result.stashPushed, false, "must not claim stashPushed when no stash entry was created");
    assert.equal(result.stashMarker, undefined, "stash marker should be absent when stash was not created");
    assert.match(result.summary, /No stashable changes found/i);
    assert.ok(
      notifications.some((n) => n.level === "warning" && n.msg.includes("M5424")),
      "warning should still be emitted when cached dirty state triggers preflight path",
    );

    const stashList = run("git stash list", repo);
    assert.equal(stashList, "", "stash list must remain empty when git stash reports nothing to save");
  } finally {
    _resetHasChangesCache();
    try { rmSync(repo, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); } catch { /* ignore */ }
  }
});
