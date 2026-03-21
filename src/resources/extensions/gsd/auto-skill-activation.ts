// Skill matching, preference resolution, and activation block building for auto-mode prompts.

import { parseTaskPlanFile } from "./files.js";
import { resolveSkillDiscoveryMode, loadEffectiveGSDPreferences, resolveAllSkillReferences } from "./preferences.js";
import type { GSDPreferences } from "./preferences.js";
import { getLoadedSkills, type Skill } from "@gsd/pi-coding-agent";
import { basename } from "node:path";

function normalizeSkillReference(ref: string): string {
  const normalized = ref.replace(/\\/g, "/").trim();
  const base = basename(normalized).replace(/\.md$/i, "");
  const name = /^SKILL$/i.test(base)
    ? basename(normalized.replace(/\/SKILL(?:\.md)?$/i, ""))
    : base;
  return name.trim().toLowerCase();
}

function tokenizeSkillContext(...parts: Array<string | null | undefined>): Set<string> {
  const tokens = new Set<string>();
  const addVariants = (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value || value.length < 2) return;
    tokens.add(value);
    tokens.add(value.replace(/[-_]+/g, " "));
    tokens.add(value.replace(/\s+/g, "-"));
    tokens.add(value.replace(/\s+/g, ""));
  };

  for (const part of parts) {
    if (!part) continue;
    const text = part.toLowerCase();
    const phraseMatches = text.match(/[a-z0-9][a-z0-9+.#/_-]{1,}/g) ?? [];
    for (const match of phraseMatches) {
      addVariants(match);
      for (const piece of match.split(/[^a-z0-9+.#]+/g)) {
        if (piece.length >= 3) addVariants(piece);
      }
    }
  }

  return tokens;
}

function skillMatchesContext(skill: Skill, contextTokens: Set<string>): boolean {
  const haystacks = [
    skill.name.toLowerCase(),
    skill.name.toLowerCase().replace(/[-_]+/g, " "),
    skill.description.toLowerCase(),
  ];

  return [...contextTokens].some(token =>
    token.length >= 3 && haystacks.some(haystack => haystack.includes(token)),
  );
}

function resolvePreferenceSkillNames(refs: string[], base: string): string[] {
  if (refs.length === 0) return [];
  const prefs: GSDPreferences = { always_use_skills: refs };
  const report = resolveAllSkillReferences(prefs, base);
  return refs.map(ref => {
    const resolution = report.resolutions.get(ref);
    return normalizeSkillReference(resolution?.resolvedPath ?? ref);
  }).filter(Boolean);
}

function ruleMatchesContext(when: string, contextTokens: Set<string>): boolean {
  const whenTokens = tokenizeSkillContext(when);
  return [...whenTokens].some(token =>
    contextTokens.has(token) || [...contextTokens].some(ctx => ctx.includes(token) || token.includes(ctx)),
  );
}

function resolveSkillRuleMatches(
  prefs: GSDPreferences | undefined,
  contextTokens: Set<string>,
  base: string,
): { include: string[]; avoid: string[] } {
  if (!prefs?.skill_rules?.length) return { include: [], avoid: [] };

  const include: string[] = [];
  const avoid: string[] = [];
  for (const rule of prefs.skill_rules) {
    if (!ruleMatchesContext(rule.when, contextTokens)) continue;
    include.push(...resolvePreferenceSkillNames([...(rule.use ?? []), ...(rule.prefer ?? [])], base));
    avoid.push(...resolvePreferenceSkillNames(rule.avoid ?? [], base));
  }
  return { include, avoid };
}

function resolvePreferredSkillNames(
  prefs: GSDPreferences | undefined,
  visibleSkills: Skill[],
  contextTokens: Set<string>,
  base: string,
): string[] {
  if (!prefs?.prefer_skills?.length) return [];
  const preferred = new Set(resolvePreferenceSkillNames(prefs.prefer_skills, base));
  return visibleSkills
    .filter(skill => preferred.has(normalizeSkillReference(skill.name)) && skillMatchesContext(skill, contextTokens))
    .map(skill => normalizeSkillReference(skill.name));
}

function formatSkillActivationBlock(skillNames: string[]): string {
  if (skillNames.length === 0) return "";
  const calls = skillNames.map(name => `Call Skill('${name}')`).join('. ');
  return `<skill_activation>${calls}.</skill_activation>`;
}

export function buildSkillActivationBlock(params: {
  base: string;
  milestoneId: string;
  milestoneTitle?: string;
  sliceId?: string;
  sliceTitle?: string;
  taskId?: string;
  taskTitle?: string;
  extraContext?: string[];
  taskPlanContent?: string | null;
  preferences?: GSDPreferences;
}): string {
  const prefs = params.preferences ?? loadEffectiveGSDPreferences()?.preferences;
  const contextTokens = tokenizeSkillContext(
    params.milestoneId,
    params.milestoneTitle,
    params.sliceId,
    params.sliceTitle,
    params.taskId,
    params.taskTitle,
    ...(params.extraContext ?? []),
    params.taskPlanContent ?? undefined,
  );

  const visibleSkills = getLoadedSkills().filter(skill => !skill.disableModelInvocation);
  const installedNames = new Set(visibleSkills.map(skill => normalizeSkillReference(skill.name)));
  const avoided = new Set(resolvePreferenceSkillNames(prefs?.avoid_skills ?? [], params.base));
  const matched = new Set<string>();

  for (const name of resolvePreferenceSkillNames(prefs?.always_use_skills ?? [], params.base)) {
    matched.add(name);
  }

  const ruleMatches = resolveSkillRuleMatches(prefs, contextTokens, params.base);
  for (const name of ruleMatches.include) matched.add(name);
  for (const name of ruleMatches.avoid) avoided.add(name);

  for (const name of resolvePreferredSkillNames(prefs, visibleSkills, contextTokens, params.base)) {
    matched.add(name);
  }

  if (params.taskPlanContent) {
    try {
      const taskPlan = parseTaskPlanFile(params.taskPlanContent);
      for (const skillName of taskPlan.frontmatter.skills_used) {
        matched.add(normalizeSkillReference(skillName));
      }
    } catch {
      // Non-fatal — malformed task plan should not break prompt construction
    }
  }

  for (const skill of visibleSkills) {
    if (skillMatchesContext(skill, contextTokens)) {
      matched.add(normalizeSkillReference(skill.name));
    }
  }

  const ordered = [...matched]
    .filter(name => installedNames.has(name) && !avoided.has(name))
    .sort();
  return formatSkillActivationBlock(ordered);
}

export function buildSkillDiscoveryVars(): { skillDiscoveryMode: string; skillDiscoveryInstructions: string } {
  const mode = resolveSkillDiscoveryMode();

  if (mode === "off") {
    return {
      skillDiscoveryMode: "off",
      skillDiscoveryInstructions: " Skill discovery is disabled. Skip this step.",
    };
  }

  const autoInstall = mode === "auto";
  const instructions = `
   Identify the key technologies, frameworks, and services this work depends on (e.g. Stripe, Clerk, Supabase, JUCE, SwiftUI).
   For each, check if a professional agent skill already exists:
   - First check \`<available_skills>\` in your system prompt — a skill may already be installed.
   - For technologies without an installed skill, run: \`npx skills find "<technology>"\`
   - Only consider skills that are **directly relevant** to core technologies — not tangentially related.
   - Evaluate results by install count and relevance to the actual work.${autoInstall
    ? `
   - Install relevant skills: \`npx skills add <owner/repo@skill> -g -y\`
   - Record installed skills in the "Skills Discovered" section of your research output.
   - Installed skills will automatically appear in subsequent units' system prompts — no manual steps needed.`
    : `
   - Note promising skills in your research output with their install commands, but do NOT install them.
   - The user will decide which to install.`
  }`;

  return {
    skillDiscoveryMode: mode,
    skillDiscoveryInstructions: instructions,
  };
}
