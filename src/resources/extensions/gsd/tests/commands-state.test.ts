/**
 * commands-state.test.ts — Tests for the /gsd state command handler.
 *
 * Tests path resolution, git status, snapshot commits, and remote
 * management using real temp directories and git repos.
 */

import {
  mkdtempSync, writeFileSync, rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

import { handleState } from "../commands-state.ts";
import { ensureStateGitRepo } from "../state-git.ts";
import { externalGsdRoot } from "../repo-identity.ts";
import { createTestContext } from "./test-helpers.ts";

const { assertEq, assertTrue, report } = createTestContext();

/** Run a git command without a shell — works inside and outside the project sandbox. */
function git(args: string[], cwd: string): string {
  return execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf-8",
    timeout: 10_000,
  }).trim();
}

function makeProjectRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "gsd-state-cmd-"));
  git(["init", "-b", "main"], dir);
  git(["config", "user.email", "t@t.com"], dir);
  git(["config", "user.name", "T"], dir);
  writeFileSync(join(dir, "README.md"), "# test\n");
  git(["add", "."], dir);
  git(["commit", "-m", "init"], dir);
  return dir;
}

function makeStateRepo(project: string): string {
  const stateDir = externalGsdRoot(project);
  ensureStateGitRepo(stateDir);
  git(["config", "user.email", "t@t.com"], stateDir);
  git(["config", "user.name", "T"], stateDir);
  return stateDir;
}

/** Minimal ExtensionCommandContext stub */
function makeCtx() {
  const messages: { text: string; level: string }[] = [];
  return {
    ctx: {
      ui: {
        notify(text: string, level: string) { messages.push({ text, level }); },
      },
    } as any,
    messages,
  };
}

// ── path subcommand ─────────────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  makeStateRepo(project);
  const { ctx, messages } = makeCtx();

  await handleState("path", ctx, project);

  assertTrue(messages.length > 0, "path: produces output");
  assertTrue(messages[0].text.includes("state directory"), "path: mentions state directory");
  assertTrue(messages[0].text.includes(".gsd/projects"), "path: includes ~/.gsd/projects path");
  assertEq(messages[0].level, "info", "path: info level");

  rmSync(project, { recursive: true, force: true });
}

// ── status subcommand ────────────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);
  writeFileSync(join(stateDir, "PROJECT.md"), "# test\n");
  const { ctx, messages } = makeCtx();

  await handleState("status", ctx, project);

  assertTrue(messages.length > 0, "status: produces output");
  assertTrue(messages[0].text.includes(stateDir), "status: includes state dir path");

  rmSync(project, { recursive: true, force: true });
}

// ── commit: creates snapshot ──────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);
  writeFileSync(join(stateDir, "PROJECT.md"), "# test\n");
  const { ctx, messages } = makeCtx();

  await handleState("commit", ctx, project);

  assertTrue(messages.some((m) => m.level === "success"), "commit: success message");
  assertTrue(messages.some((m) => m.text.includes("committed")), "commit: mentions committed");

  const log = git(["log", "--oneline"], stateDir);
  assertTrue(log.includes("snapshot"), "commit: snapshot appears in git log");

  rmSync(project, { recursive: true, force: true });
}

// ── commit: custom message ────────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);
  writeFileSync(join(stateDir, "PROJECT.md"), "# test\n");
  const { ctx, messages } = makeCtx();

  await handleState("commit my custom message", ctx, project);

  assertTrue(messages.some((m) => m.level === "success"), "commit custom msg: success");
  const log = git(["log", "--oneline"], stateDir);
  assertTrue(log.includes("my custom message"), "commit custom msg: custom message in log");

  rmSync(project, { recursive: true, force: true });
}

// ── commit: nothing to commit ─────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);

  // Commit everything first so tree is clean
  writeFileSync(join(stateDir, "PROJECT.md"), "# test\n");
  git(["add", "--all"], stateDir);
  git(["commit", "-m", "init"], stateDir);

  const { ctx, messages } = makeCtx();
  await handleState("commit", ctx, project);

  assertTrue(
    messages.some((m) => m.text.includes("Nothing to commit")),
    "commit clean tree: nothing to commit message",
  );

  rmSync(project, { recursive: true, force: true });
}

// ── remote: show when none configured ─────────────────────────────────────────

{
  const project = makeProjectRepo();
  makeStateRepo(project);
  const { ctx, messages } = makeCtx();

  await handleState("remote", ctx, project);

  assertTrue(
    messages.some((m) => m.text.toLowerCase().includes("no remote")),
    "remote show: no remote configured message",
  );

  rmSync(project, { recursive: true, force: true });
}

// ── remote: add new remote ────────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);
  const { ctx, messages } = makeCtx();

  await handleState("remote git@github.com:team/project-state.git", ctx, project);

  assertTrue(messages.some((m) => m.level === "success"), "remote add: success message");

  const remoteUrl = git(["remote", "get-url", "origin"], stateDir);
  assertEq(remoteUrl, "git@github.com:team/project-state.git", "remote add: git remote URL matches");

  rmSync(project, { recursive: true, force: true });
}

// ── remote: update existing remote ────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);
  git(["remote", "add", "origin", "git@github.com:old/repo.git"], stateDir);
  const { ctx, messages } = makeCtx();

  await handleState("remote git@github.com:new/repo.git", ctx, project);

  assertTrue(messages.some((m) => m.level === "success"), "remote update: success");
  const remoteUrl = git(["remote", "get-url", "origin"], stateDir);
  assertEq(remoteUrl, "git@github.com:new/repo.git", "remote update: URL updated in git");

  rmSync(project, { recursive: true, force: true });
}

// ── push: no remote configured ────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  makeStateRepo(project);
  const { ctx, messages } = makeCtx();

  await handleState("push", ctx, project);

  assertTrue(
    messages.some((m) => m.level === "warning" && m.text.includes("No remote")),
    "push no remote: warning message",
  );

  rmSync(project, { recursive: true, force: true });
}

// ── push: with local bare remote ─────────────────────────────────────────────

{
  const project = makeProjectRepo();
  const stateDir = makeStateRepo(project);

  // Create a local bare repo to push to
  const bareRemote = mkdtempSync(join(tmpdir(), "gsd-state-bare-"));
  git(["init", "--bare", "-b", "main"], bareRemote);
  git(["remote", "add", "origin", bareRemote], stateDir);

  // Add something to commit and push
  writeFileSync(join(stateDir, "PROJECT.md"), "# test\n");

  const { ctx, messages } = makeCtx();
  await handleState("push", ctx, project);

  assertTrue(messages.some((m) => m.level === "success"), "push: success");

  // Verify objects were pushed to bare remote
  const refs = git(["show-ref", "--heads"], bareRemote);
  assertTrue(refs.length > 0, "push: refs exist in remote after push");

  rmSync(project, { recursive: true, force: true });
  rmSync(bareRemote, { recursive: true, force: true });
}

// ── unknown subcommand ────────────────────────────────────────────────────────

{
  const project = makeProjectRepo();
  makeStateRepo(project);
  const { ctx, messages } = makeCtx();

  await handleState("foobar", ctx, project);

  assertTrue(messages.some((m) => m.level === "warning"), "unknown: warning level");
  assertTrue(
    messages.some((m) => m.text.includes("Unknown subcommand")),
    "unknown: mentions unknown subcommand",
  );

  rmSync(project, { recursive: true, force: true });
}

report("commands-state");
