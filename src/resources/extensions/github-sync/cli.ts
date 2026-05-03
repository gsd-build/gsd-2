/**
 * Thin wrapper around the `gh` CLI.
 *
 * Every public function returns `GhResult<T>` — never throws.
 * Uses `execFileSync` (not `execSync`) for safety.
 */

import { execFileSync } from "node:child_process";
import { GIT_NO_PROMPT_ENV } from "../gsd/git-constants.js";

// ─── Result Type ────────────────────────────────────────────────────────────

export interface GhResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): GhResult<T> {
  return { ok: true, data };
}

function fail<T>(error: string): GhResult<T> {
  return { ok: false, error };
}

// ─── gh Availability ────────────────────────────────────────────────────────

let _ghAvailable: boolean | null = null;

export function ghIsAvailable(): boolean {
  if (_ghAvailable !== null) return _ghAvailable;
  try {
    execFileSync("gh", ["--version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5_000,
    });
    _ghAvailable = true;
  } catch {
    _ghAvailable = false;
  }
  return _ghAvailable;
}

/** Reset cached availability (for testing). */
export function _resetGhCache(): void {
  _ghAvailable = null;
}

// ─── Rate Limit Check ───────────────────────────────────────────────────────

let _rateLimitCheckedAt = 0;
let _rateLimitOk = true;
const RATE_LIMIT_CHECK_INTERVAL_MS = 300_000; // 5 minutes

export function ghHasRateLimit(cwd: string): boolean {
  const now = Date.now();
  if (now - _rateLimitCheckedAt < RATE_LIMIT_CHECK_INTERVAL_MS) return _rateLimitOk;
  _rateLimitCheckedAt = now;
  try {
    const raw = execFileSync("gh", ["api", "rate_limit", "--jq", ".rate.remaining"], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10_000,
    }).trim();
    const remaining = parseInt(raw, 10);
    _rateLimitOk = Number.isFinite(remaining) && remaining >= 100;
  } catch {
    // Can't check — assume OK so we don't silently disable sync
    _rateLimitOk = true;
  }
  return _rateLimitOk;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const GH_TIMEOUT = 15_000;
const MAX_BODY_LENGTH = 65_000;

function truncateBody(body: string): string {
  if (body.length <= MAX_BODY_LENGTH) return body;
  return body.slice(0, MAX_BODY_LENGTH) + "\n\n---\n*Body truncated (exceeded 65K characters)*";
}

function runGh(args: string[], cwd: string): GhResult<string> {
  try {
    const stdout = execFileSync("gh", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: GH_TIMEOUT,
    }).trim();
    return ok(stdout);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fail(msg);
  }
}

function runGhJson<T>(args: string[], cwd: string): GhResult<T> {
  const result = runGh(args, cwd);
  if (!result.ok) return fail(result.error!);
  try {
    return ok(JSON.parse(result.data!) as T);
  } catch {
    return fail(`Failed to parse JSON: ${result.data}`);
  }
}

// ─── Repo Detection ─────────────────────────────────────────────────────────

export function ghDetectRepo(cwd: string): GhResult<string> {
  const result = runGh(
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  const repo = result.data!.trim();
  if (!repo || !repo.includes("/")) return fail("Could not detect repo");
  return ok(repo);
}

// ─── Issues ─────────────────────────────────────────────────────────────────

export interface CreateIssueOpts {
  repo: string;
  title: string;
  body: string;
  labels?: string[];
  milestone?: number;
  parentIssue?: number;
}

export function ghCreateIssue(cwd: string, opts: CreateIssueOpts): GhResult<number> {
  const args = [
    "issue", "create",
    "--repo", opts.repo,
    "--title", opts.title,
    "--body", truncateBody(opts.body),
  ];
  if (opts.labels?.length) {
    args.push("--label", opts.labels.join(","));
  }
  if (opts.milestone) {
    args.push("--milestone", String(opts.milestone));
  }

  const result = runGh(args, cwd);
  if (!result.ok) return fail(result.error!);

  // gh issue create returns the URL; extract issue number
  const match = result.data!.match(/\/issues\/(\d+)/);
  if (!match) return fail(`Could not parse issue number from: ${result.data}`);
  const issueNumber = parseInt(match[1], 10);

  // If parent specified, add as sub-issue via GraphQL
  if (opts.parentIssue) {
    ghAddSubIssue(cwd, opts.repo, opts.parentIssue, issueNumber);
  }

  return ok(issueNumber);
}

export function ghCloseIssue(cwd: string, repo: string, issueNumber: number, comment?: string): GhResult<void> {
  if (comment) {
    ghAddComment(cwd, repo, issueNumber, comment);
  }
  const result = runGh(
    ["issue", "close", String(issueNumber), "--repo", repo],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  return ok(undefined);
}

export function ghAddComment(cwd: string, repo: string, issueNumber: number, body: string): GhResult<void> {
  const result = runGh(
    ["issue", "comment", String(issueNumber), "--repo", repo, "--body", truncateBody(body)],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  return ok(undefined);
}

// ─── Sub-Issues (GraphQL) ───────────────────────────────────────────────────

function ghAddSubIssue(cwd: string, repo: string, parentNumber: number, childNumber: number): GhResult<void> {
  // Get node IDs for both issues
  const parentResult = runGhJson<{ id: string }>(
    ["api", `repos/${repo}/issues/${parentNumber}`, "--jq", "{id: .node_id}"],
    cwd,
  );
  const childResult = runGhJson<{ id: string }>(
    ["api", `repos/${repo}/issues/${childNumber}`, "--jq", "{id: .node_id}"],
    cwd,
  );

  if (!parentResult.ok || !childResult.ok) {
    return fail("Could not resolve issue node IDs for sub-issue linking");
  }

  const mutation = `mutation { addSubIssue(input: { issueId: "${parentResult.data!.id}", subIssueId: "${childResult.data!.id}" }) { issue { id } } }`;
  return runGh(["api", "graphql", "-f", `query=${mutation}`], cwd) as GhResult<void>;
}

// ─── Milestones ─────────────────────────────────────────────────────────────

export function ghCreateMilestone(cwd: string, repo: string, title: string, description: string): GhResult<number> {
  const result = runGhJson<{ number: number }>(
    [
      "api", `repos/${repo}/milestones`,
      "-X", "POST",
      "-f", `title=${title}`,
      "-f", `description=${truncateBody(description)}`,
      "-f", "state=open",
      "--jq", "{number: .number}",
    ],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  return ok(result.data!.number);
}

export function ghCloseMilestone(cwd: string, repo: string, milestoneNumber: number): GhResult<void> {
  const result = runGh(
    [
      "api", `repos/${repo}/milestones/${milestoneNumber}`,
      "-X", "PATCH",
      "-f", "state=closed",
    ],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  return ok(undefined);
}

// ─── Pull Requests ──────────────────────────────────────────────────────────

export interface CreatePROpts {
  repo: string;
  base: string;
  head: string;
  title: string;
  body: string;
  draft?: boolean;
}

export function ghCreatePR(cwd: string, opts: CreatePROpts): GhResult<number> {
  const args = [
    "pr", "create",
    "--repo", opts.repo,
    "--base", opts.base,
    "--head", opts.head,
    "--title", opts.title,
    "--body", truncateBody(opts.body),
  ];
  if (opts.draft) args.push("--draft");

  const result = runGh(args, cwd);
  if (!result.ok) return fail(result.error!);

  const match = result.data!.match(/\/pull\/(\d+)/);
  if (!match) return fail(`Could not parse PR number from: ${result.data}`);
  return ok(parseInt(match[1], 10));
}

export function ghMarkPRReady(cwd: string, repo: string, prNumber: number): GhResult<void> {
  const result = runGh(
    ["pr", "ready", String(prNumber), "--repo", repo],
    cwd,
  );
  if (!result.ok) return fail(result.error!);
  return ok(undefined);
}

export function ghMergePR(cwd: string, repo: string, prNumber: number, strategy: "squash" | "merge" = "squash"): GhResult<void> {
  const args = [
    "pr", "merge", String(prNumber),
    "--repo", repo,
    strategy === "squash" ? "--squash" : "--merge",
    "--delete-branch",
  ];
  const result = runGh(args, cwd);
  if (!result.ok) return fail(result.error!);
  return ok(undefined);
}

// ─── Projects v2 ────────────────────────────────────────────────────────────

export function ghAddToProject(cwd: string, repo: string, projectNumber: number, issueNumber: number): GhResult<void> {
  // Get the issue's node ID first
  const issueResult = runGhJson<{ id: string }>(
    ["api", `repos/${repo}/issues/${issueNumber}`, "--jq", "{id: .node_id}"],
    cwd,
  );
  if (!issueResult.ok) return fail(issueResult.error!);

  // Get the project's node ID
  const [owner] = repo.split("/");
  const projectResult = runGhJson<{ id: string }>(
    [
      "api", "graphql",
      "-f", `query=query { user(login: "${owner}") { projectV2(number: ${projectNumber}) { id } } }`,
      "--jq", ".data.user.projectV2.id",
    ],
    cwd,
  );

  // Try org if user fails
  let projectId: string | undefined;
  if (projectResult.ok && projectResult.data?.id) {
    projectId = projectResult.data.id;
  } else {
    const orgResult = runGhJson<{ id: string }>(
      [
        "api", "graphql",
        "-f", `query=query { organization(login: "${owner}") { projectV2(number: ${projectNumber}) { id } } }`,
        "--jq", ".data.organization.projectV2.id",
      ],
      cwd,
    );
    if (orgResult.ok) projectId = orgResult.data?.id;
  }

  if (!projectId) return fail("Could not find project");

  const mutation = `mutation { addProjectV2ItemById(input: { projectId: "${projectId}", contentId: "${issueResult.data!.id}" }) { item { id } } }`;
  return runGh(["api", "graphql", "-f", `query=${mutation}`], cwd) as GhResult<void>;
}

// ─── Branch Operations ──────────────────────────────────────────────────────

export function ghPushBranch(cwd: string, branch: string, setUpstream = true): GhResult<void> {
  const args = ["git", "push"];
  if (setUpstream) args.push("-u", "origin", branch);
  else args.push("origin", branch);

  try {
    execFileSync(args[0], args.slice(1), {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      env: GIT_NO_PROMPT_ENV,
    });
    return ok(undefined);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

export function ghCreateBranch(cwd: string, branch: string, from: string): GhResult<void> {
  try {
    execFileSync("git", ["branch", branch, from], {
      cwd,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
      env: GIT_NO_PROMPT_ENV,
    });
    return ok(undefined);
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
