import { describe, expect, it, beforeEach, afterAll } from "bun:test";
import { join } from "node:path";
import { mkdir, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  getRecentProjects,
  addRecentProject,
  _setRecentFilePath,
} from "../src/server/recent-projects";

const TEST_DIR = join(tmpdir(), `gsd-recent-test-${Date.now()}`);
const TEST_RECENT_FILE = join(TEST_DIR, "recent-projects.json");

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
  _setRecentFilePath(TEST_RECENT_FILE);
});

afterAll(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("getRecentProjects", () => {
  it("returns empty array when file does not exist", async () => {
    const result = await getRecentProjects();
    expect(result).toEqual([]);
  });

  it("returns parsed projects from existing file", async () => {
    await mkdir(TEST_DIR, { recursive: true });
    const projects = [
      { path: "/home/user/project1", name: "project1", lastOpened: 1000, isGsdProject: true },
    ];
    const { writeFile } = await import("node:fs/promises");
    await writeFile(TEST_RECENT_FILE, JSON.stringify(projects));
    const result = await getRecentProjects();
    expect(result).toEqual(projects);
  });
});

describe("addRecentProject", () => {
  it("creates directory and writes file when none exists", async () => {
    await addRecentProject({
      path: "/home/user/myproject",
      name: "myproject",
      lastOpened: Date.now(),
      isGsdProject: true,
    });
    const content = await readFile(TEST_RECENT_FILE, "utf-8");
    const projects = JSON.parse(content);
    expect(projects.length).toBe(1);
    expect(projects[0].path).toBe("/home/user/myproject");
  });

  it("moves duplicate path to front (deduplication)", async () => {
    await addRecentProject({
      path: "/proj/a",
      name: "a",
      lastOpened: 1000,
      isGsdProject: false,
    });
    await addRecentProject({
      path: "/proj/b",
      name: "b",
      lastOpened: 2000,
      isGsdProject: false,
    });
    // Re-add a — should move to front
    await addRecentProject({
      path: "/proj/a",
      name: "a",
      lastOpened: 3000,
      isGsdProject: false,
    });

    const result = await getRecentProjects();
    expect(result[0].path).toBe("/proj/a");
    expect(result[0].lastOpened).toBe(3000);
    expect(result.length).toBe(2);
  });

  it("trims list to 20 entries max", async () => {
    for (let i = 0; i < 25; i++) {
      await addRecentProject({
        path: `/proj/${i}`,
        name: `${i}`,
        lastOpened: i,
        isGsdProject: false,
      });
    }
    const result = await getRecentProjects();
    expect(result.length).toBe(20);
    // Most recent should be first
    expect(result[0].path).toBe("/proj/24");
  });
});
