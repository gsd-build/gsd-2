import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadSyncMapping,
  saveSyncMapping,
  createEmptyMapping,
  getMilestoneRecord,
  getSliceRecord,
  getTaskRecord,
  getTaskIssueNumber,
  setMilestoneRecord,
  setSliceRecord,
  setTaskRecord,
} from "../mapping.ts";
import type { SyncMapping, MilestoneSyncRecord, SliceSyncRecord, SyncEntityRecord } from "../types.ts";

describe("mapping", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "gsd-sync-test-"));
    mkdirSync(join(tmpDir, ".gsd"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loadSyncMapping returns null when no file exists", () => {
    const result = loadSyncMapping(tmpDir);
    assert.equal(result, null);
  });

  it("round-trips save/load", () => {
    const mapping = createEmptyMapping("owner/repo");
    saveSyncMapping(tmpDir, mapping);
    const loaded = loadSyncMapping(tmpDir);
    assert.deepEqual(loaded, mapping);
  });

  it("createEmptyMapping has correct structure", () => {
    const mapping = createEmptyMapping("owner/repo");
    assert.equal(mapping.version, 1);
    assert.equal(mapping.repo, "owner/repo");
    assert.deepEqual(mapping.milestones, {});
    assert.deepEqual(mapping.slices, {});
    assert.deepEqual(mapping.tasks, {});
  });

  it("milestone record accessors work", () => {
    const mapping = createEmptyMapping("owner/repo");
    assert.equal(getMilestoneRecord(mapping, "M001"), null);

    const record: MilestoneSyncRecord = {
      issueNumber: 42,
      ghMilestoneNumber: 1,
      lastSyncedAt: "2025-01-01T00:00:00Z",
      state: "open",
    };
    setMilestoneRecord(mapping, "M001", record);
    assert.deepEqual(getMilestoneRecord(mapping, "M001"), record);
  });

  it("slice record accessors work", () => {
    const mapping = createEmptyMapping("owner/repo");
    assert.equal(getSliceRecord(mapping, "M001", "S01"), null);

    const record: SliceSyncRecord = {
      issueNumber: 0,
      prNumber: 50,
      branch: "milestone/M001/S01",
      lastSyncedAt: "2025-01-01T00:00:00Z",
      state: "open",
    };
    setSliceRecord(mapping, "M001", "S01", record);
    assert.deepEqual(getSliceRecord(mapping, "M001", "S01"), record);
  });

  it("task record accessors work", () => {
    const mapping = createEmptyMapping("owner/repo");
    assert.equal(getTaskRecord(mapping, "M001", "S01", "T01"), null);
    assert.equal(getTaskIssueNumber(mapping, "M001", "S01", "T01"), null);

    const record: SyncEntityRecord = {
      issueNumber: 43,
      lastSyncedAt: "2025-01-01T00:00:00Z",
      state: "open",
    };
    setTaskRecord(mapping, "M001", "S01", "T01", record);
    assert.deepEqual(getTaskRecord(mapping, "M001", "S01", "T01"), record);
    assert.equal(getTaskIssueNumber(mapping, "M001", "S01", "T01"), 43);
  });

  it("rejects mapping with wrong version", () => {
    const mapping = createEmptyMapping("owner/repo");
    (mapping as any).version = 2;
    saveSyncMapping(tmpDir, mapping);
    const loaded = loadSyncMapping(tmpDir);
    assert.equal(loaded, null);
  });
});
