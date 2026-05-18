#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Comment on canonical issue lifecycle labels and recycle stale needs-info issues.

import { readFileSync } from "node:fs";

export const LIFECYCLE_MARKER_PREFIX = "<!-- gsd-issue-lifecycle:";

export const LIFECYCLE_MESSAGES = {
  "needs-info": [
    "Thanks for the report. This needs a bit more information before it can move forward.",
    "",
    "Please add the missing reproduction details, expected behavior, actual behavior, and any relevant logs or screenshots.",
  ].join("\n"),
  "ready-for-agent": [
    "This is specified enough for an agent to pick up.",
    "",
    "A maintainer can assign or queue this when capacity is available.",
  ].join("\n"),
  "ready-for-human": [
    "This needs human implementation or maintainer judgment.",
    "",
    "A maintainer should keep ownership rather than routing it to an unattended agent.",
  ].join("\n"),
  wontfix: [
    "This has been marked as not planned.",
    "",
    "A maintainer can close it when the decision is final.",
  ].join("\n"),
};

export function lifecycleMarker(label) {
  return `${LIFECYCLE_MARKER_PREFIX}${label} -->`;
}

export function buildLifecycleComment(label) {
  const message = LIFECYCLE_MESSAGES[label];
  if (!message) return null;
  return `${lifecycleMarker(label)}\n${message}`;
}

export function hasLifecycleComment(comments, label) {
  const marker = lifecycleMarker(label);
  return comments.some((comment) => String(comment.body || "").includes(marker));
}

export function daysAgoIsoDate(days, now = new Date()) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function buildNeedsInfoSweepQuery(owner, repo, days, now = new Date()) {
  return `repo:${owner}/${repo} is:issue is:open label:needs-info updated:<${daysAgoIsoDate(days, now)}`;
}

export function buildNeedsInfoSweepComment(days) {
  return [
    lifecycleMarker("needs-info-sweep"),
    `No update has arrived for ${days} days, so this is moving back to maintainer triage.`,
    "",
    "A maintainer can restore `needs-info` if more reporter details are still required.",
  ].join("\n");
}

function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function githubJson(path, options = {}) {
  const token = env("GITHUB_TOKEN");
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API request failed: ${response.status} ${body}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listComments(owner, repo, issueNumber) {
  return githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`);
}

export function parseNeedsInfoMaxDays(rawDays = process.env.NEEDS_INFO_MAX_DAYS || "14") {
  const days = Number.parseInt(rawDays, 10);
  if (!Number.isInteger(days) || days <= 0) {
    throw new Error(`NEEDS_INFO_MAX_DAYS must be a positive integer, got: ${rawDays}`);
  }
  return days;
}

export async function listNeedsInfoSweepIssues(githubJsonFn, owner, repo, days) {
  const query = buildNeedsInfoSweepQuery(owner, repo, days);
  const perPage = 100;
  const issues = [];

  for (let page = 1; ; page += 1) {
    const search = await githubJsonFn(
      `/search/issues?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`,
    );
    const pageItems = (search.items || []).filter((issue) => !issue.pull_request);
    issues.push(...pageItems);
    if (pageItems.length < perPage) break;
  }

  return issues;
}

async function postComment(owner, repo, issueNumber, body) {
  return githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function commentOnLabel() {
  const event = JSON.parse(readFileSync(env("GITHUB_EVENT_PATH"), "utf8"));
  const label = event.label?.name;
  const body = buildLifecycleComment(label);
  if (!body) {
    console.log(`No lifecycle comment configured for label: ${label || "unknown"}`);
    return;
  }

  if (event.issue?.pull_request) {
    console.log("Skipping pull request.");
    return;
  }

  const [owner, repo] = env("GITHUB_REPOSITORY").split("/");
  const issueNumber = event.issue.number;
  const comments = await listComments(owner, repo, issueNumber);

  if (hasLifecycleComment(comments, label)) {
    console.log(`Lifecycle comment for ${label} already exists.`);
    return;
  }

  await postComment(owner, repo, issueNumber, body);
  console.log(`Posted lifecycle comment for ${label}.`);
}

async function sweepNeedsInfo() {
  const [owner, repo] = env("GITHUB_REPOSITORY").split("/");
  const days = parseNeedsInfoMaxDays();
  const issues = await listNeedsInfoSweepIssues(githubJson, owner, repo, days);

  for (const issue of issues) {
    try {
      const comments = await listComments(owner, repo, issue.number);
      if (!hasLifecycleComment(comments, "needs-info-sweep")) {
        await postComment(owner, repo, issue.number, buildNeedsInfoSweepComment(days));
      }
      await githubJson(`/repos/${owner}/${repo}/issues/${issue.number}/labels/needs-info`, {
        method: "DELETE",
      });
      await githubJson(`/repos/${owner}/${repo}/issues/${issue.number}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: ["needs-triage"] }),
      });
      console.log(`Moved #${issue.number} from needs-info to needs-triage.`);
    } catch (error) {
      console.error(`Failed to process #${issue.number}: ${error.message}`);
    }
  }
}

const mode = process.argv[2] || "comment";

if (import.meta.url === `file://${process.argv[1]}`) {
  const action = mode === "sweep" ? sweepNeedsInfo : commentOnLabel;
  action().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
