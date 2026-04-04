/**
 * GSD Command — /gsd codebase
 *
 * Generate and manage the codebase map (.gsd/CODEBASE.md).
 * Subcommands: generate, update, stats, help
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@gsd/pi-coding-agent";

import {
  generateCodebaseMap,
  updateCodebaseMap,
  writeCodebaseMap,
  getCodebaseMapStats,
  readCodebaseMap,
} from "./codebase-generator.js";

const USAGE =
  "Usage: /gsd codebase [generate|update|stats]\n\n" +
  "  generate [--max-files N]  — Generate or regenerate CODEBASE.md\n" +
  "  update                    — Incremental update (preserves descriptions)\n" +
  "  stats                     — Show file count, coverage, and generation time\n" +
  "  help                      — Show this help\n\n" +
  "With no subcommand, shows stats if a map exists or help if not.";

export async function handleCodebase(
  args: string,
  ctx: ExtensionCommandContext,
  _pi: ExtensionAPI,
): Promise<void> {
  const basePath = process.cwd();
  const parts = args.trim().split(/\s+/);
  const sub = parts[0] ?? "";

  switch (sub) {
    case "generate": {
      const maxFiles = parseMaxFiles(args, ctx);
      if (maxFiles === false) return; // validation failed, message already shown

      const existing = readCodebaseMap(basePath);
      const existingDescriptions = existing
        ? (await import("./codebase-generator.js")).parseCodebaseMap(existing)
        : undefined;

      const result = generateCodebaseMap(basePath, { maxFiles: maxFiles ?? undefined }, existingDescriptions);

      if (result.fileCount === 0) {
        ctx.ui.notify(
          "Codebase map generated with 0 files.\n" +
          "Is this a git repository? Run 'git ls-files' to verify.",
          "warning",
        );
        return;
      }

      const outPath = writeCodebaseMap(basePath, result.content);
      ctx.ui.notify(
        `Codebase map generated: ${result.fileCount} files\n` +
        `Written to: ${outPath}` +
        (result.truncated ? `\n⚠ Truncated — increase --max-files to include all files` : ""),
        "success",
      );
      return;
    }

    case "update": {
      const existing = readCodebaseMap(basePath);
      if (!existing) {
        ctx.ui.notify(
          "No codebase map found. Run /gsd codebase generate to create one.",
          "warning",
        );
        return;
      }

      const maxFiles = parseMaxFiles(args, ctx);
      if (maxFiles === false) return;

      const result = updateCodebaseMap(basePath, { maxFiles: maxFiles ?? undefined });
      writeCodebaseMap(basePath, result.content);

      ctx.ui.notify(
        `Codebase map updated: ${result.fileCount} files\n` +
        `  Added: ${result.added} | Removed: ${result.removed} | Unchanged: ${result.unchanged}` +
        (result.truncated ? `\n⚠ Truncated — increase --max-files to include all files` : ""),
        "success",
      );
      return;
    }

    case "stats": {
      showStats(basePath, ctx);
      return;
    }

    case "help":
      ctx.ui.notify(USAGE, "info");
      return;

    case "": {
      // Safe default: show stats if map exists, help if not
      const existing = readCodebaseMap(basePath);
      if (existing) {
        showStats(basePath, ctx);
      } else {
        ctx.ui.notify(USAGE, "info");
      }
      return;
    }

    default:
      ctx.ui.notify(
        `Unknown subcommand "${sub}".\n\n${USAGE}`,
        "warning",
      );
  }
}

function showStats(basePath: string, ctx: ExtensionCommandContext): void {
  const stats = getCodebaseMapStats(basePath);
  if (!stats.exists) {
    ctx.ui.notify("No codebase map found. Run /gsd codebase generate to create one.", "info");
    return;
  }

  const coverage = stats.fileCount > 0
    ? Math.round((stats.describedCount / stats.fileCount) * 100)
    : 0;

  ctx.ui.notify(
    `Codebase Map Stats:\n` +
    `  Files: ${stats.fileCount}\n` +
    `  Described: ${stats.describedCount} (${coverage}%)\n` +
    `  Undescribed: ${stats.undescribedCount}\n` +
    `  Generated: ${stats.generatedAt ?? "unknown"}\n\n` +
    (stats.undescribedCount > 0
      ? `Tip: Run /gsd codebase update to refresh after file changes.`
      : `Coverage is complete.`),
    "info",
  );
}

/**
 * Parse and validate --max-files flag.
 * Returns the parsed number, undefined if flag not present, or false if invalid.
 */
function parseMaxFiles(args: string, ctx: ExtensionCommandContext): number | undefined | false {
  const maxFilesStr = extractFlag(args, "--max-files");
  if (!maxFilesStr) return undefined;

  const maxFiles = parseInt(maxFilesStr, 10);
  if (isNaN(maxFiles) || maxFiles < 1) {
    ctx.ui.notify("--max-files must be a positive integer (e.g. --max-files 200).", "warning");
    return false;
  }
  return maxFiles;
}

function extractFlag(args: string, flag: string): string | undefined {
  const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}[=\\s]+(\\S+)`);
  const match = args.match(regex);
  return match?.[1];
}
