#!/usr/bin/env node
// Project/App: GSD-2
// File Purpose: Guard agent workflows from broad non-write-user trigger expansion.

const WORKFLOW_FILE_RE = /^\.github\/workflows\/[^/]+\.ya?ml$/;
const NON_WRITE_USERS_RE = /\ballowed_non_write_users\b/;

export function findAllowedNonWriteUserExpansions(files) {
  const findings = [];

  for (const file of files) {
    if (!WORKFLOW_FILE_RE.test(file.filename || "")) continue;
    const patch = file.patch || "";
    const additions = patch
      .split("\n")
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"));

    for (const line of additions) {
      if (!NON_WRITE_USERS_RE.test(line)) continue;
      findings.push({
        filename: file.filename,
        line: line.slice(1).trim(),
      });
    }
  }

  return findings;
}

export function formatFindings(findings) {
  const lines = [
    "Agent workflow guard blocked this PR because it expands non-write-user triggers.",
    "",
    "Only maintainers should intentionally allow users without write access to trigger privileged workflow automation.",
    "",
    "Findings:",
  ];

  for (const finding of findings) {
    lines.push(`- ${finding.filename}: \`${finding.line}\``);
  }

  return lines.join("\n");
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

async function listPullRequestFiles(owner, repo, pullNumber) {
  const files = [];
  for (let page = 1; ; page++) {
    const batch = await githubJson(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100&page=${page}`,
    );
    files.push(...batch);
    if (batch.length < 100) break;
  }
  return files;
}

async function run() {
  const [owner, repo] = env("GITHUB_REPOSITORY").split("/");
  const pullNumber = env("PR_NUMBER");
  const files = await listPullRequestFiles(owner, repo, pullNumber);
  const findings = findAllowedNonWriteUserExpansions(files);

  if (findings.length === 0) {
    console.log("No non-write-user workflow trigger expansion found.");
    return;
  }

  const message = formatFindings(findings);
  console.error(message);
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
