import { describe, expect, it, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm } from "node:fs/promises";
import {
  getWorkspacePath,
  createProject,
  _setWorkspaceFilePath,
} from "../src/server/workspace-api";

let tempProjectPath: string | null = null;

afterEach(async () => {
  if (tempProjectPath) {
    await rm(tempProjectPath, { recursive: true, force: true }).catch(() => {});
    tempProjectPath = null;
  }
});

describe("getWorkspacePath", () => {
  it("returns ~/GSD Projects on non-Windows", () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    const result = getWorkspacePath();
    Object.defineProperty(process, "platform", { value: original, configurable: true });
    expect(result).toContain("GSD Projects");
  });

  it("returns USERPROFILE/GSD Projects on Windows", () => {
    const original = process.platform;
    const originalUserProfile = process.env.USERPROFILE;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    process.env.USERPROFILE = "C:\\Users\\TestUser";
    const result = getWorkspacePath();
    Object.defineProperty(process, "platform", { value: original, configurable: true });
    process.env.USERPROFILE = originalUserProfile ?? "";
    expect(result).toContain("GSD Projects");
    expect(result).toContain("TestUser");
  });

  it("workspace_path setting stored and read", () => {
    _setWorkspaceFilePath("/custom/workspace-settings.json");
    const result = getWorkspacePath("/custom");
    expect(result).toBe("/custom");
  });
});

describe("createProject", () => {
  it("creates directory and runs git init", async () => {
    const workspaceDir = join(tmpdir(), `gsd-workspace-test-${Date.now()}`);
    const projectName = "TestProject";
    tempProjectPath = join(workspaceDir, projectName);

    const { projectPath } = await createProject(projectName, workspaceDir);

    // Returned path should exist
    const { existsSync } = await import("node:fs");
    expect(existsSync(projectPath)).toBe(true);

    // .git/ subdirectory should exist (git init ran)
    expect(existsSync(join(projectPath, ".git"))).toBe(true);

    tempProjectPath = projectPath;
  });
});
