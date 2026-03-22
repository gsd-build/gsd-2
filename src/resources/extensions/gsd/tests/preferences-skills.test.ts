import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT_DIR_ENV = "GSD_CODING_AGENT_DIR";

function makeSkillDir(baseDir: string, relativePath: string, skillName: string): string {
  const dir = join(baseDir, relativePath, skillName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `# ${skillName}\n`);
  return dir;
}

test("resolveSkillReference resolves bare skill names from ~/.agents/skills", async () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-pref-skills-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent-home");
  const homeDir = join(root, "home");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });

  const previousAgentDir = process.env[AGENT_DIR_ENV];
  const previousHome = process.env.HOME;
  process.env[AGENT_DIR_ENV] = agentDir;
  process.env.HOME = homeDir;

  try {
    makeSkillDir(homeDir, ".agents/skills", "cmux");
    const { resolveSkillReference } = await import("../preferences-skills.ts");
    const result = resolveSkillReference("cmux", cwd);
    assert.equal(result.method, "user-skill");
    assert.equal(result.resolvedPath, join(homeDir, ".agents", "skills", "cmux", "SKILL.md"));
  } finally {
    if (previousAgentDir === undefined) delete process.env[AGENT_DIR_ENV];
    else process.env[AGENT_DIR_ENV] = previousAgentDir;

    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;

    rmSync(root, { recursive: true, force: true });
  }
});

test("resolveSkillReference prefers ~/.gsd/agent/skills over ~/.agents/skills for the same bare name", async () => {
  const root = mkdtempSync(join(tmpdir(), "gsd-pref-skills-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent-home");
  const homeDir = join(root, "home");
  mkdirSync(cwd, { recursive: true });
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(homeDir, { recursive: true });

  const previousAgentDir = process.env[AGENT_DIR_ENV];
  const previousHome = process.env.HOME;
  process.env[AGENT_DIR_ENV] = agentDir;
  process.env.HOME = homeDir;

  try {
    makeSkillDir(agentDir, "skills", "cmux");
    makeSkillDir(homeDir, ".agents/skills", "cmux");
    const { resolveSkillReference } = await import("../preferences-skills.ts");
    const result = resolveSkillReference("cmux", cwd);
    assert.equal(result.method, "user-skill");
    assert.equal(result.resolvedPath, join(agentDir, "skills", "cmux", "SKILL.md"));
  } finally {
    if (previousAgentDir === undefined) delete process.env[AGENT_DIR_ENV];
    else process.env[AGENT_DIR_ENV] = previousAgentDir;

    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;

    rmSync(root, { recursive: true, force: true });
  }
});
