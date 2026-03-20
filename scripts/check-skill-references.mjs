#!/usr/bin/env node

/**
 * Validates that relative .md file references in bundled skills point to
 * files that actually exist on disk.
 *
 * Focused on catching broken cross-file references within skills:
 *   - Markdown links to .md files: [text](path/to/file.md)
 *   - Backtick-quoted .md paths that use relative navigation: `../foo/bar.md`
 *     or skill subdirectory paths: `references/foo.md`, `workflows/bar.md`
 *
 * Deliberately ignores:
 *   - URLs (http://, https://)
 *   - Paths starting with ~ (home-dir references, not repo-relative)
 *   - Glob patterns containing * or {}
 *   - Template placeholders containing {{ or {word}
 *   - Bare extensions like `.md`, `.ts`
 *   - Example/placeholder paths (path/to/...)
 *   - Paths that reference files outside the skills tree via ../ beyond the
 *     skills root (those are cross-concern refs, not validatable here)
 *
 * Exit 0 if all references resolve. Exit 1 if any are broken.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, dirname, extname } from "node:path";

const SKILLS_DIR = resolve("src/resources/skills");

/** Recursively collect all .md files under a directory. */
function collectMdFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMdFiles(full));
    } else if (entry.isFile() && extname(entry.name) === ".md") {
      results.push(full);
    }
  }
  return results;
}

/** Return true if this reference should be validated. */
function shouldValidate(ref) {
  // Must end with .md (we only validate markdown cross-references)
  if (!ref.endsWith(".md")) return false;
  // Skip URLs
  if (/^https?:\/\//.test(ref)) return false;
  // Skip home-dir paths
  if (ref.startsWith("~")) return false;
  // Skip glob patterns
  if (/[*{}]/.test(ref)) return false;
  // Skip template placeholders like {{foo}} or {foo}
  if (/\{[^}]+\}/.test(ref)) return false;
  // Skip bare extensions like ".md"
  if (/^\.\w+$/.test(ref)) return false;
  // Skip obvious example paths
  if (/^path\/to\//.test(ref)) return false;
  // Skip absolute paths
  if (ref.startsWith("/")) return false;
  // Only validate paths that look like structural skill references:
  // relative navigation (../ or ./) or skill subdirectories (references/, workflows/)
  if (
    !ref.startsWith("./") &&
    !ref.startsWith("../") &&
    !ref.startsWith("references/") &&
    !ref.startsWith("workflows/") &&
    !ref.startsWith("scripts/") &&
    !ref.startsWith("templates/")
  ) {
    return false;
  }
  return true;
}

/** Strip trailing anchor: foo.md#section -> foo.md */
function stripAnchor(ref) {
  const idx = ref.indexOf("#");
  return idx >= 0 ? ref.slice(0, idx) : ref;
}

/**
 * Extract validatable .md references from markdown content.
 * Returns array of { ref, line }.
 */
function extractReferences(content) {
  const refs = [];
  const lines = content.split("\n");

  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track fenced code blocks (``` or ~~~)
    if (/^(\s*)(`{3,}|~{3,})/.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // Pattern 1: Markdown links [text](path.md) or [text](path.md#anchor)
    const mdLinkRe = /\[(?:[^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = mdLinkRe.exec(line)) !== null) {
      const raw = stripAnchor(match[1].trim());
      if (shouldValidate(raw)) {
        refs.push({ ref: raw, line: lineNum });
      }
    }

    // Pattern 2: Backtick-quoted paths to .md files
    const backtickRe = /`([^`]+\.md(?:#[^`]*)?)`/g;
    while ((match = backtickRe.exec(line)) !== null) {
      const raw = stripAnchor(match[1].trim());
      if (shouldValidate(raw)) {
        refs.push({ ref: raw, line: lineNum });
      }
    }
  }

  return refs;
}

// --- Main ---

if (!existsSync(SKILLS_DIR)) {
  console.error(`Skills directory not found: ${SKILLS_DIR}`);
  process.exit(1);
}

const mdFiles = collectMdFiles(SKILLS_DIR);
let brokenCount = 0;
let checkedCount = 0;

for (const file of mdFiles) {
  const content = readFileSync(file, "utf-8");
  const refs = extractReferences(content);
  const fileDir = dirname(file);
  const displayPath = file.replace(resolve(".") + "/", "");

  for (const { ref, line } of refs) {
    checkedCount++;
    const resolved = resolve(fileDir, ref);
    if (!existsSync(resolved)) {
      console.error(
        `ERROR: ${displayPath}:${line} references "${ref}" but file does not exist`
      );
      brokenCount++;
    }
  }
}

if (brokenCount > 0) {
  console.error(
    `\n${brokenCount} broken reference(s) found across ${mdFiles.length} skill files.`
  );
  process.exit(1);
} else {
  console.log(
    `All references valid. Checked ${checkedCount} reference(s) across ${mdFiles.length} skill file(s).`
  );
  process.exit(0);
}
