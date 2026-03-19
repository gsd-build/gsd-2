import { describe, expect, it, afterEach } from "bun:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rm, writeFile, mkdir } from "node:fs/promises";
import {
  getRecentProjects,
  addRecentProject,
  _setRecentFilePath,
  archiveProject,
  restoreProject,
  getArchivedProjects,
} from "../src/server/recent-projects";

const TEST_DIR = join(tmpdir(), `gsd-archiving-test-${Date.now()}`);
const TEST_FILE = join(TEST_DIR, "recent-projects.json");

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
  _setRecentFilePath(TEST_FILE);
});

async function setupProject(path: string, name: string): Promise<void> {
  await mkdir(TEST_DIR, { recursive: true });
  _setRecentFilePath(TEST_FILE);
  await addRecentProject({
    path,
    name,
    lastOpened: Date.now(),
    isGsdProject: true,
  });
}

describe("archiveProject", () => {
  it("archive sets archived true and project disappears from main grid", async () => {
    await setupProject("/projects/test-archive", "test-archive");
    await archiveProject("/projects/test-archive");
    const projects = await getRecentProjects();
    const found = projects.find((p) => p.path === "/projects/test-archive");
    // archived projects should be filtered out of main list OR have archived: true
    if (found) {
      expect((found as any).archived).toBe(true);
    } else {
      // project removed from main list is also acceptable
      expect(found).toBeUndefined();
    }
  });
});

describe("getArchivedProjects", () => {
  it("show archived returns archived projects", async () => {
    await setupProject("/projects/test-show-archived", "test-show-archived");
    await archiveProject("/projects/test-show-archived");
    const archived = await getArchivedProjects();
    const found = archived.find((p) => p.path === "/projects/test-show-archived");
    expect(found).toBeDefined();
    expect((found as any).archived).toBe(true);
  });
});

describe("restoreProject", () => {
  it("restore sets archived false and returns project to main grid", async () => {
    await setupProject("/projects/test-restore", "test-restore");
    await archiveProject("/projects/test-restore");
    await restoreProject("/projects/test-restore");
    const projects = await getRecentProjects();
    const found = projects.find((p) => p.path === "/projects/test-restore");
    expect(found).toBeDefined();
    // archived should be false or absent after restore
    const archived = (found as any).archived;
    expect(archived === false || archived === undefined).toBe(true);
  });
});
