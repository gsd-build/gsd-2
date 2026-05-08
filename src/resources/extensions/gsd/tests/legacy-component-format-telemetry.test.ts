// Project/App: GSD-2
// File Purpose: Verifies telemetry for legacy component formats.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadComponentFromAgentFile, loadComponentFromDir } from "../component-loader.js";
import { getLegacyTelemetry, resetLegacyTelemetry } from "../legacy-telemetry.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "gsd-legacy-component-format-"));
}

test("legacy component telemetry counts successful skill and agent format loads", () => {
  const dir = makeTempDir();
  try {
    resetLegacyTelemetry();

    const modernDir = join(dir, "modern-skill");
    mkdirSync(modernDir, { recursive: true });
    writeFileSync(join(modernDir, "component.yaml"), `
apiVersion: gsd/v1
kind: skill
metadata:
  name: modern-skill
  description: "Modern skill"
spec:
  prompt: SKILL.md
`, "utf-8");
    writeFileSync(join(modernDir, "SKILL.md"), "Modern content.", "utf-8");
    assert.ok(loadComponentFromDir(modernDir, "user").component);
    assert.equal(getLegacyTelemetry()["legacy.componentFormatUsed"], 0);

    const legacySkillDir = join(dir, "legacy-skill");
    mkdirSync(legacySkillDir, { recursive: true });
    writeFileSync(join(legacySkillDir, "SKILL.md"), `---
name: legacy-skill
description: Legacy skill
---
Skill content.
`, "utf-8");
    assert.ok(loadComponentFromDir(legacySkillDir, "user").component);
    assert.equal(getLegacyTelemetry()["legacy.componentFormatUsed"], 1);

    const legacyAgentFile = join(dir, "legacy-agent.md");
    writeFileSync(legacyAgentFile, `---
name: legacy-agent
description: Legacy agent
tools: read, grep
---
Agent content.
`, "utf-8");
    assert.ok(loadComponentFromAgentFile(legacyAgentFile, "user").component);
    assert.equal(getLegacyTelemetry()["legacy.componentFormatUsed"], 2);
  } finally {
    resetLegacyTelemetry();
    rmSync(dir, { recursive: true, force: true });
  }
});
