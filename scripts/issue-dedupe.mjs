#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Suggest possible duplicate issues without closing them.

export const DEDUPE_MARKER = "<!-- gsd-issue-dedupe -->";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
]);

export function tokenizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
}

export function scoreTitleSimilarity(leftTitle, rightTitle) {
  const left = new Set(tokenizeTitle(leftTitle));
  const right = new Set(tokenizeTitle(rightTitle));
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) {
    if (right.has(token)) shared++;
  }

  return (2 * shared) / (left.size + right.size);
}

export function buildSearchQuery(owner, repo, issue) {
  const terms = tokenizeTitle(issue.title).slice(0, 6);
  return [`repo:${owner}/${repo}`, "is:issue", "in:title", ...terms].join(" ");
}

export function findDuplicateCandidates(issue, searchItems, options = {}) {
  const minScore = options.minScore ?? 0.58;
  const maxCandidates = options.maxCandidates ?? 3;

  return searchItems
    .filter((item) => item.number !== issue.number && !item.pull_request)
    .map((item) => ({
      number: item.number,
      title: item.title,
      html_url: item.html_url,
      score: scoreTitleSimilarity(issue.title, item.title),
    }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score || a.number - b.number)
    .slice(0, maxCandidates);
}

export function buildDuplicateComment(candidates) {
  const lines = [
    DEDUPE_MARKER,
    "Possible duplicate issues found. A maintainer should review these before closing or linking anything:",
    "",
  ];

  for (const candidate of candidates) {
    const percent = Math.round(candidate.score * 100);
    lines.push(`- #${candidate.number}: ${candidate.title} (${percent}% title match)`);
  }

  return lines.join("\n");
}

export function hasExistingDedupeComment(comments) {
  return comments.some((comment) => String(comment.body || "").includes(DEDUPE_MARKER));
}

export async function hasExistingDedupeCommentInIssue(githubJsonFn, owner, repo, issueNumber) {
  const perPage = 100;
  for (let page = 1; ; page += 1) {
    const comments = await githubJsonFn(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=${perPage}&page=${page}`,
    );
    if (hasExistingDedupeComment(comments)) return true;
    if (comments.length < perPage) return false;
  }
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

async function run() {
  const [owner, repo] = env("GITHUB_REPOSITORY").split("/");
  const issueNumber = Number(env("ISSUE_NUMBER"));
  const issue = await githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}`);

  if (issue.pull_request) {
    console.log("Skipping pull request.");
    return;
  }

  const query = buildSearchQuery(owner, repo, issue);
  const search = await githubJson(`/search/issues?q=${encodeURIComponent(query)}&per_page=20`);
  const candidates = findDuplicateCandidates(issue, search.items || []);

  if (candidates.length === 0) {
    console.log("No likely duplicate issues found.");
    return;
  }

  if (await hasExistingDedupeCommentInIssue(githubJson, owner, repo, issueNumber)) {
    console.log("Duplicate suggestion comment already exists.");
    return;
  }

  await githubJson(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body: buildDuplicateComment(candidates) }),
  });
  console.log(`Posted ${candidates.length} duplicate candidate(s).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
