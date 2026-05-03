// GSD-2 + db-writer root-artifact path guard: regression tests for M1 fix

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

import { createWorkspace, scopeMilestone } from "../workspace.ts";
import {
  saveArtifactToDb,
  saveArtifactToDbByScope,
  saveArtifactToDbForWorkspace,
} from "../db-writer.ts";
import { openDatabase, closeDatabase } from "../gsd-db.ts";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeProjectDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "gsd-dbwriter-root-")));
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

// ─── Suite 1: saveArtifactToDb with undefined milestone_id writes to .gsd/ root, not milestones/ ──

describe("saveArtifactToDb: root artifact (no milestone_id) routes to workspace .gsd root", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeProjectDir();
    openDatabase(join(tmp, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("opts.milestone_id = undefined writes artifact at .gsd/REQUIREMENTS.md, not inside milestones/", async () => {
    const content = "# Requirements\n\nTest root artifact.\n";
    const opts = {
      path: "REQUIREMENTS.md",
      artifact_type: "REQUIREMENTS_DRAFT",
      content,
      milestone_id: undefined,
    };

    await saveArtifactToDb(opts, tmp);

    const ws = createWorkspace(tmp);
    const expectedPath = resolve(ws.contract.projectGsd, "REQUIREMENTS.md");

    assert.ok(existsSync(expectedPath), "root artifact written at .gsd/REQUIREMENTS.md");
    assert.equal(readFileSync(expectedPath, "utf-8"), content, "content matches");

    // Must NOT be inside milestones/ — the latent trap being fixed
    const wrongPath = resolve(ws.contract.projectGsd, "milestones", "", "REQUIREMENTS.md");
    assert.ok(!existsSync(wrongPath), "artifact NOT written inside milestones/");
  });

  test("opts.milestone_id = null writes artifact at .gsd/ root", async () => {
    const content = "# Project\n\nRoot project doc.\n";
    const opts = {
      path: "PROJECT.md",
      artifact_type: "PROJECT",
      content,
      milestone_id: undefined,
    };

    await saveArtifactToDb(opts, tmp);

    const ws = createWorkspace(tmp);
    const expectedPath = resolve(ws.contract.projectGsd, "PROJECT.md");

    assert.ok(existsSync(expectedPath), "PROJECT.md written at .gsd/PROJECT.md");
    assert.equal(readFileSync(expectedPath, "utf-8"), content, "content matches");
  });

  test("path resolves via workspace.contract.projectGsd, not a hand-rolled join", async () => {
    const content = "# Knowledge\n";
    const opts = {
      path: "KNOWLEDGE.md",
      artifact_type: "KNOWLEDGE",
      content,
      milestone_id: undefined,
    };

    await saveArtifactToDb(opts, tmp);

    const ws = createWorkspace(tmp);
    // The canonical path must equal contract.projectGsd + '/KNOWLEDGE.md'
    const canonicalPath = join(ws.contract.projectGsd, "KNOWLEDGE.md");
    assert.ok(existsSync(canonicalPath), "file at contract.projectGsd/KNOWLEDGE.md");
    assert.equal(
      canonicalPath,
      join(ws.projectRoot, ".gsd", "KNOWLEDGE.md"),
      "contract.projectGsd-based path equals projectRoot/.gsd/KNOWLEDGE.md",
    );
  });
});

// ─── Suite 2: saveArtifactToDb with a real milestone_id still works (no regression) ──

describe("saveArtifactToDb: milestone_id present routes to milestones/ (no regression)", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeProjectDir();
    openDatabase(join(tmp, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("milestone_id = 'M001' writes to .gsd/milestones/M001/...", async () => {
    const relPath = "milestones/M001/M001-CONTEXT.md";
    const content = "# M001 Context\n";
    const opts = {
      path: relPath,
      artifact_type: "CONTEXT",
      content,
      milestone_id: "M001",
    };

    await saveArtifactToDb(opts, tmp);

    const ws = createWorkspace(tmp);
    const expectedPath = resolve(ws.contract.projectGsd, relPath);

    assert.ok(existsSync(expectedPath), "milestone artifact written at correct path");
    assert.equal(readFileSync(expectedPath, "utf-8"), content, "content matches");
  });
});

// ─── Suite 3: saveArtifactToDbByScope with empty milestoneId throws a clear error ──

describe("saveArtifactToDbByScope: empty milestoneId throws defensive error", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeProjectDir();
    openDatabase(join(tmp, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("scope with empty milestoneId throws GSDError mentioning saveArtifactToDbForWorkspace", async () => {
    const ws = createWorkspace(tmp);
    const emptyScope = scopeMilestone(ws, "");
    const opts = {
      path: "REQUIREMENTS.md",
      artifact_type: "REQUIREMENTS_DRAFT",
      content: "# req\n",
    };

    await assert.rejects(
      () => saveArtifactToDbByScope(emptyScope, opts),
      (err: unknown) => {
        assert.ok(err instanceof Error, "thrown value is an Error");
        assert.ok(
          err.message.includes("milestoneId is empty"),
          `error message should mention 'milestoneId is empty', got: ${err.message}`,
        );
        assert.ok(
          err.message.includes("saveArtifactToDbForWorkspace"),
          `error message should mention 'saveArtifactToDbForWorkspace', got: ${err.message}`,
        );
        return true;
      },
    );
  });
});

// ─── Suite 4: saveArtifactToDbForWorkspace writes at contract.projectGsd, not milestones/ ──

describe("saveArtifactToDbForWorkspace: writes directly to .gsd root via workspace contract", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeProjectDir();
    openDatabase(join(tmp, ".gsd", "gsd.db"));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("root artifact lands at contract.projectGsd/path, not milestones/", async () => {
    const ws = createWorkspace(tmp);
    const content = "# Requirements\n";
    const opts = {
      path: "REQUIREMENTS.md",
      artifact_type: "REQUIREMENTS_DRAFT",
      content,
    };

    await saveArtifactToDbForWorkspace(ws, opts);

    const expectedPath = resolve(ws.contract.projectGsd, "REQUIREMENTS.md");
    assert.ok(existsSync(expectedPath), "artifact written at contract.projectGsd/REQUIREMENTS.md");
    assert.equal(readFileSync(expectedPath, "utf-8"), content, "content matches");

    // Must not have landed inside milestones/
    const milestonePath = join(ws.contract.projectGsd, "milestones", "", "REQUIREMENTS.md");
    assert.ok(!existsSync(milestonePath), "artifact NOT inside milestones/empty-string/");
  });
});
