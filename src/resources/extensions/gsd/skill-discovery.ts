/**
 * GSD Skill Discovery
 *
 * Detects skills installed during auto-mode by comparing the current
 * skills directory against a snapshot taken at auto-mode start.
 *
 * New skills are injected into the system prompt via before_agent_start,
 * making them visible to all subsequent units without requiring a reload.
 */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, loadSkillsFromDir } from "@gsd/pi-coding-agent";

const SKILLS_DIR = join(getAgentDir(), "skills");

export interface DiscoveredSkill {
  name: string;
  description: string;
  location: string;
}

/** Snapshot of skill names at auto-mode start */
let baselineSkills: Set<string> | null = null;

/**
 * Snapshot the current skills directory. Call at auto-mode start.
 */
export function snapshotSkills(): void {
  baselineSkills = new Set(listSkillDirs());
}

/**
 * Clear the snapshot. Call when auto-mode stops.
 */
export function clearSkillSnapshot(): void {
  baselineSkills = null;
}

/**
 * Check if a snapshot is active (auto-mode is running with discovery).
 */
export function hasSkillSnapshot(): boolean {
  return baselineSkills !== null;
}

/**
 * Detect skills installed since the snapshot was taken.
 * Returns skill metadata for any new skills found.
 */
export function detectNewSkills(): DiscoveredSkill[] {
  if (!baselineSkills) return [];

  const current = listSkillDirs();
  const newSkills: DiscoveredSkill[] = [];

  for (const dir of current) {
    if (baselineSkills.has(dir)) continue;

    const result = loadSkillsFromDir({ dir: join(SKILLS_DIR, dir), source: "user" });
    const skill = result.skills[0];
    if (skill && !skill.disableModelInvocation) {
      newSkills.push({
        name: skill.name,
        description: skill.description,
        location: skill.filePath,
      });
    }
  }

  return newSkills;
}

/**
 * Format discovered skills as an XML block matching pi's <available_skills> format.
 * This can be appended to the system prompt so the LLM sees them naturally.
 */
export function formatSkillsXml(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) return "";

  const entries = skills.map(s => `  <skill>
    <name>${escapeXml(s.name)}</name>
    <description>${escapeXml(s.description)}</description>
    <location>${escapeXml(s.location)}</location>
  </skill>`).join("\n");

  return `\n<newly_discovered_skills>
The following skills were installed during this auto-mode session.
Use the read tool to load a skill's file when the task matches its description.

${entries}
</newly_discovered_skills>`;
}

// ─── Internals ────────────────────────────────────────────────────────────────

function listSkillDirs(): string[] {
  if (!existsSync(SKILLS_DIR)) return [];
  try {
    return readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);
  } catch {
    return [];
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
