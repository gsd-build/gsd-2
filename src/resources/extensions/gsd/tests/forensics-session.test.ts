import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { buildBeforeAgentStartResult } from "../bootstrap/system-context.ts";
import { getForensicsSessionKey, loadActiveForensicsContext, persistActiveForensicsSession } from "../forensics-session.ts";

function createCtx(sessionKey: string | null) {
  return {
    ui: {
      notify() {},
      setStatus() {},
    },
    sessionManager: sessionKey
      ? {
          getSessionId: () => sessionKey,
        }
      : {},
  } as any;
}

test("forensics session marker reinjects the saved report on follow-up turns", async () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-forensics-session-"));
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    mkdirSync(join(root, ".gsd", "runtime"), { recursive: true });
    mkdirSync(join(root, ".gsd", "forensics"), { recursive: true });

    const reportPath = join(root, ".gsd", "forensics", "report-2026-03-28T12-00-00-000Z.md");
    writeFileSync(
      reportPath,
      [
        "# GSD Forensic Report",
        "",
        "## Problem Description",
        "",
        "Follow-up turns lose forensics context.",
      ].join("\n"),
      "utf-8",
    );

    const sessionKey = "sess-forensics-123";
    await persistActiveForensicsSession(root, sessionKey, reportPath);

    assert.equal(getForensicsSessionKey(createCtx(sessionKey)), sessionKey);

    const injected = loadActiveForensicsContext(root, sessionKey, "What should I do next?");
    assert.ok(injected);
    assert.match(injected!, /Active GSD Forensics Session/);
    assert.match(injected!, /Follow-up turns lose forensics context/);

    const response = await buildBeforeAgentStartResult(
      { prompt: "What should I do next?", systemPrompt: "base prompt" },
      createCtx(sessionKey),
    );

    assert.equal(response?.message?.customType, "gsd-forensics-context");
    assert.match(response?.message?.content ?? "", /Follow-up turns lose forensics context/);
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test("forensics session marker does not reinject during the initial forensics bootstrap turn", async () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-forensics-bootstrap-"));
  const previousCwd = process.cwd();
  try {
    process.chdir(root);
    mkdirSync(join(root, ".gsd", "runtime"), { recursive: true });
    mkdirSync(join(root, ".gsd", "forensics"), { recursive: true });

    const reportPath = join(root, ".gsd", "forensics", "report-2026-03-28T12-00-00-000Z.md");
    writeFileSync(reportPath, "# GSD Forensic Report\n", "utf-8");
    await persistActiveForensicsSession(root, "sess-forensics-boot", reportPath);

    const response = await buildBeforeAgentStartResult(
      {
        prompt: [
          "You are debugging GSD itself.",
          "## Forensic Report",
          "## GSD Source Location",
        ].join("\n"),
        systemPrompt: "base prompt",
      },
      createCtx("sess-forensics-boot"),
    );

    assert.equal(response?.message, undefined);
    assert.ok(existsSync(join(root, ".gsd", "runtime", "active-forensics.json")));
  } finally {
    process.chdir(previousCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
