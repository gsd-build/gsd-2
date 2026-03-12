/**
 * Git log API for commit history.
 * Returns GSD-relevant commits (docs, feat, fix, refactor prefixes).
 * Follows route dispatcher pattern from fs-api.ts.
 */

import { spawn as nodeSpawn } from "node:child_process";

export interface GitCommit {
  hash: string;
  subject: string;
  date: string;
  author: string;
}

/**
 * Get git log entries from a repository.
 * Filters to GSD-relevant commit patterns (docs(), feat(), fix(), refactor()).
 */
function getGitLog(repoRoot: string, limit: number): Promise<GitCommit[]> {
  return new Promise((resolve) => {
    const args = [
      "log",
      "--oneline",
      `--format={"hash":"%h","subject":"%s","date":"%ci","author":"%an"}`,
      `-n`, `${limit}`,
    ];

    const proc = nodeSpawn("git", args, {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    let stdout = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0 || !stdout.trim()) {
        resolve([]);
        return;
      }

      const commits: GitCommit[] = [];
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        try {
          const commit = JSON.parse(line) as GitCommit;
          // Filter to GSD-relevant commit patterns
          if (/^(docs|feat|fix|refactor|test|chore)\(/.test(commit.subject)) {
            commits.push(commit);
          }
        } catch {
          // Skip malformed lines (e.g., subjects containing quotes)
        }
      }

      resolve(commits);
    });

    proc.on("error", (err) => {
      console.error("[git-api] Spawn error:", err.message);
      resolve([]);
    });
  });
}

/**
 * HTTP request handler for /api/git/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleGitRequest(
  req: Request,
  url: URL,
  repoRoot: string
): Promise<Response | null> {
  const { pathname, searchParams } = url;

  // GET /api/git/log
  if (pathname === "/api/git/log" && req.method === "GET") {
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const safeLimit = Math.min(Math.max(limit, 1), 500);

    const commits = await getGitLog(repoRoot, safeLimit);
    return Response.json({ commits });
  }

  return null;
}
