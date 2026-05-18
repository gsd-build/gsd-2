// Project/App: GSD-2
// File Purpose: Detect unresolved Git conflict state before automation runs.

import { execFileSync } from "node:child_process";
import { GIT_NO_PROMPT_ENV } from "./git-constants.js";

function splitZeroDelimited(output: string): string[] {
  return output.split("\0").filter(Boolean);
}

export function listUnmergedGitPaths(basePath: string): string[] | null {
  try {
    const output = execFileSync("git", ["diff", "--name-only", "--diff-filter=U", "-z"], {
      cwd: basePath,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
      env: GIT_NO_PROMPT_ENV,
    });
    return [...new Set(splitZeroDelimited(output))].sort();
  } catch {
    return null;
  }
}
