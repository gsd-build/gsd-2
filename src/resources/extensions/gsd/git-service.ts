import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadEffectiveGSDPreferences } from "./preferences.ts";

export interface GitServiceOptions {
  allowFailure?: boolean;
  stdio?: "ignore" | "pipe" | "inherit";
}

export class GitService {
  private basePath: string;
  constructor(basePath: string) {
    this.basePath = basePath;
  }

  run(args: string[], options: GitServiceOptions = {}): string {
    try {
      return execSync(`git ${args.join(" ")}`, {
        cwd: this.basePath,
        stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
        encoding: "utf-8",
      }).trim();
    } catch (error) {
      if (options.allowFailure) return "";
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`git ${args.join(" ")} failed in ${this.basePath}: ${message}`);
    }
  }

  getCurrentBranch(): string {
    return this.run(["branch", "--show-current"]);
  }

  getMainBranch(): string {
    // When inside a worktree, slice branches should merge into the worktree's
    // own branch (worktree/<name>), not main — main is checked out by the
    // parent working tree and git would refuse the checkout.
    const wtName = this.detectWorktreeName();
    if (wtName) {
      const wtBranch = `worktree/${wtName}`;
      // Verify the branch exists (it should — createWorktree made it)
      const exists = this.run(["show-ref", "--verify", `refs/heads/${wtBranch}`], { allowFailure: true });
      if (exists) return wtBranch;
      // Worktree branch is gone — return current branch rather than falling
      // through to main/master which would cause a checkout conflict
      return this.getCurrentBranch();
    }

    const symbolic = this.run(["symbolic-ref", "refs/remotes/origin/HEAD"], { allowFailure: true });
    if (symbolic) {
      const match = symbolic.match(/refs\/remotes\/origin\/(.+)$/);
      if (match) return match[1]!;
    }

    const mainExists = this.run(["show-ref", "--verify", "refs/heads/main"], { allowFailure: true });
    if (mainExists) return "main";

    const masterExists = this.run(["show-ref", "--verify", "refs/heads/master"], { allowFailure: true });
    if (masterExists) return "master";

    return this.getCurrentBranch();
  }

  private detectWorktreeName(): string | null {
    // We use "/" and "\" to be cross-platform, though node path.sep is usually preferred.
    const marker = "/.gsd/worktrees/";
    const markerWin = "\\.gsd\\worktrees\\";
    
    let idx = this.basePath.indexOf(marker);
    let usedMarker = marker;
    if (idx === -1) {
      idx = this.basePath.indexOf(markerWin);
      usedMarker = markerWin;
    }
    
    if (idx === -1) return null;
    const afterMarker = this.basePath.slice(idx + usedMarker.length);
    const name = afterMarker.split("/")[0]?.split("\\")[0];
    return name || null;
  }

  /**
   * Create a hidden snapshot ref for recovery.
   * Format: refs/gsd/snapshots/<branch>/<timestamp>
   */
  snapshot(branch: string): string {
    const timestamp = Date.now();
    const ref = `refs/gsd/snapshots/${branch}/${timestamp}`;
    
    // We need a commit to point the ref to. 
    // If there are dirty changes, we create a temporary commit.
    const status = this.run(["status", "--short"]);
    if (status.trim()) {
      this.run(["add", "-A"]);
      // Use a temporary commit that we'll immediately reset --soft
      this.run(["commit", "-m", `"GSD Snapshot: ${branch} at ${timestamp}"`, "--no-verify"]);
      const commitHash = this.run(["rev-parse", "HEAD"]);
      this.run(["update-ref", ref, commitHash]);
      this.run(["reset", "--soft", "HEAD~1"]);
    } else {
      const commitHash = this.run(["rev-parse", "HEAD"]);
      this.run(["update-ref", ref, commitHash]);
    }
    
    return ref;
  }

  /**
   * Restore state from a snapshot ref.
   */
  restore(ref: string): void {
    this.run(["reset", "--hard", ref]);
  }

  /**
   * Detect and run verification command (merge guard).
   */
  async verify(): Promise<void> {
    const prefs = loadEffectiveGSDPreferences()?.preferences.git;
    const guard = prefs?.merge_guard ?? "auto";

    if (guard === "never") return;

    let command: string | null = null;
    if (guard === "auto" || guard === "always") {
      command = this.detectVerificationCommand();
    } else {
      command = guard;
    }

    if (!command) {
      if (guard === "always") {
        throw new Error("Merge guard set to 'always' but no verification command could be detected.");
      }
      return;
    }

    console.log(`[GSD Git] Running verification: ${command}`);
    try {
      execSync(command, { cwd: this.basePath, stdio: "inherit" });
    } catch (error) {
      throw new Error(`Verification failed: ${command}`);
    }
  }

  private detectVerificationCommand(): string | null {
    const pkgPath = join(this.basePath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        const scripts = pkg.scripts ?? {};
        if (scripts.test) return "npm run test";
        if (scripts.build) return "npm run build";
      } catch { /* ignore */ }
    }

    if (existsSync(join(this.basePath, "Cargo.toml"))) return "cargo test";
    if (existsSync(join(this.basePath, "Makefile"))) return "make test";
    if (existsSync(join(this.basePath, "pyproject.toml"))) return "python -m pytest";

    return null;
  }

  /**
   * Push to remote if enabled in preferences.
   */
  push(branch?: string): void {
    const prefs = loadEffectiveGSDPreferences()?.preferences.git;
    if (!prefs?.auto_push && !prefs?.push_branches) return;

    const remote = prefs.remote ?? "origin";
    const target = branch ?? this.getCurrentBranch();

    // Check if remote exists
    const remotes = this.run(["remote"]);
    if (!remotes.includes(remote)) return;

    if (branch) {
      if (prefs.push_branches) {
        this.run(["push", "-u", remote, target], { allowFailure: true });
      }
    } else {
      if (prefs.auto_push) {
        this.run(["push", remote, target], { allowFailure: true });
      }
    }
  }
}
