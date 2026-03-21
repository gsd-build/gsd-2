// File loading and DB-aware formatting helpers for auto-mode prompt construction.

import { loadFile, parseRoadmap, loadActiveOverrides, formatOverridesSection } from "./files.js";
import type { InlineLevel } from "./types.js";
import {
  resolveMilestoneFile, resolveSliceFile, resolveGsdRootFile, relGsdRootFile,
  relSliceFile,
} from "./paths.js";
import { resolveInlineLevel } from "./preferences.js";
import { existsSync } from "node:fs";
import { truncateAtSectionBoundary } from "./context-budget.js";
import { formatDecisionsCompact, formatRequirementsCompact } from "./structured-data-formatter.js";

export async function inlineFile(
  absPath: string | null, relPath: string, label: string,
): Promise<string> {
  const content = absPath ? await loadFile(absPath) : null;
  if (!content) {
    return `### ${label}\nSource: \`${relPath}\`\n\n_(not found — file does not exist yet)_`;
  }
  return `### ${label}\nSource: \`${relPath}\`\n\n${content.trim()}`;
}

export async function inlineFileOptional(
  absPath: string | null, relPath: string, label: string,
): Promise<string | null> {
  const content = absPath ? await loadFile(absPath) : null;
  if (!content) return null;
  return `### ${label}\nSource: \`${relPath}\`\n\n${content.trim()}`;
}

export async function inlineFileSmart(
  absPath: string | null, relPath: string, label: string,
  query?: string, threshold = 3000,
): Promise<string> {
  const content = absPath ? await loadFile(absPath) : null;
  if (!content) {
    return `### ${label}\nSource: \`${relPath}\`\n\n_(not found — file does not exist yet)_`;
  }

  if (content.length <= threshold || !query) {
    return `### ${label}\nSource: \`${relPath}\`\n\n${content.trim()}`;
  }

  const truncated = truncateAtSectionBoundary(content, threshold).content;
  return `### ${label}\nSource: \`${relPath}\`\n\n${truncated}`;
}

export async function inlineDependencySummaries(
  mid: string, sid: string, base: string, budgetChars?: number,
): Promise<string> {
  const roadmapFile = resolveMilestoneFile(base, mid, "ROADMAP");
  const roadmapContent = roadmapFile ? await loadFile(roadmapFile) : null;
  if (!roadmapContent) return "- (no dependencies)";

  const roadmap = parseRoadmap(roadmapContent);
  const sliceEntry = roadmap.slices.find(s => s.id === sid);
  if (!sliceEntry || sliceEntry.depends.length === 0) return "- (no dependencies)";

  const sections: string[] = [];
  const seen = new Set<string>();
  for (const dep of sliceEntry.depends) {
    if (seen.has(dep)) continue;
    seen.add(dep);
    const summaryFile = resolveSliceFile(base, mid, dep, "SUMMARY");
    const summaryContent = summaryFile ? await loadFile(summaryFile) : null;
    const relPath = relSliceFile(base, mid, dep, "SUMMARY");
    if (summaryContent) {
      sections.push(`#### ${dep} Summary\nSource: \`${relPath}\`\n\n${summaryContent.trim()}`);
    } else {
      sections.push(`- \`${relPath}\` _(not found)_`);
    }
  }

  const result = sections.join("\n\n");
  if (budgetChars !== undefined && result.length > budgetChars) {
    return truncateAtSectionBoundary(result, budgetChars).content;
  }
  return result;
}

export async function inlineGsdRootFile(
  base: string, filename: string, label: string,
): Promise<string | null> {
  const key = filename.replace(/\.md$/i, "").toUpperCase() as "PROJECT" | "DECISIONS" | "QUEUE" | "STATE" | "REQUIREMENTS" | "KNOWLEDGE";
  const absPath = resolveGsdRootFile(base, key);
  if (!existsSync(absPath)) return null;
  return inlineFileOptional(absPath, relGsdRootFile(key), label);
}

export async function inlineDecisionsFromDb(
  base: string, milestoneId?: string, scope?: string, level?: InlineLevel,
): Promise<string | null> {
  const inlineLevel = level ?? resolveInlineLevel();
  try {
    const { isDbAvailable } = await import("./gsd-db.js");
    if (isDbAvailable()) {
      const { queryDecisions, formatDecisionsForPrompt } = await import("./context-store.js");
      const decisions = queryDecisions({ milestoneId, scope });
      if (decisions.length > 0) {
        const formatted = inlineLevel !== "full"
          ? formatDecisionsCompact(decisions)
          : formatDecisionsForPrompt(decisions);
        return `### Decisions\nSource: \`.gsd/DECISIONS.md\`\n\n${formatted}`;
      }
    }
  } catch {
    // DB not available — fall through to filesystem
  }
  return inlineGsdRootFile(base, "decisions.md", "Decisions");
}

export async function inlineRequirementsFromDb(
  base: string, sliceId?: string, level?: InlineLevel,
): Promise<string | null> {
  const inlineLevel = level ?? resolveInlineLevel();
  try {
    const { isDbAvailable } = await import("./gsd-db.js");
    if (isDbAvailable()) {
      const { queryRequirements, formatRequirementsForPrompt } = await import("./context-store.js");
      const requirements = queryRequirements({ sliceId });
      if (requirements.length > 0) {
        const formatted = inlineLevel !== "full"
          ? formatRequirementsCompact(requirements)
          : formatRequirementsForPrompt(requirements);
        return `### Requirements\nSource: \`.gsd/REQUIREMENTS.md\`\n\n${formatted}`;
      }
    }
  } catch {
    // DB not available — fall through to filesystem
  }
  return inlineGsdRootFile(base, "requirements.md", "Requirements");
}

export async function inlineProjectFromDb(
  base: string,
): Promise<string | null> {
  try {
    const { isDbAvailable } = await import("./gsd-db.js");
    if (isDbAvailable()) {
      const { queryProject } = await import("./context-store.js");
      const content = queryProject();
      if (content) {
        return `### Project\nSource: \`.gsd/PROJECT.md\`\n\n${content}`;
      }
    }
  } catch {
    // DB not available — fall through to filesystem
  }
  return inlineGsdRootFile(base, "project.md", "Project");
}
