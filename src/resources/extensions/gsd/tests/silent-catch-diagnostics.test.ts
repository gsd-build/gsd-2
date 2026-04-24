/**
 * Verify that catch blocks across GSD source files use the centralized
 * workflow-logger (logWarning/logError) instead of raw process.stderr.write,
 * console.error, or being completely empty (#3348, #3345).
 *
 * Two tests:
 * 1. Auto-mode files must have zero empty catch blocks (fully migrated).
 * 2. All GSD files must not use raw stderr/console in catch blocks.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * Implementation note — why we do not naïvely scan for catch blocks with a
 * regex plus a brace counter.
 *
 * A naïve counter that increments/decrements on raw `{`/`}` characters
 * silently miscounts when those characters appear inside string literals,
 * template literals, regex literals, or comments — producing both false
 * positives (claiming an empty catch when the body is not actually empty)
 * and false negatives (walking past the real close and failing to flag a
 * genuinely silent catch). See #4836.
 *
 * The fix is to strip strings/templates/regex/comments to neutral whitespace
 * *before* running the structural scan. We don't need a full TypeScript
 * parser — we just need the brace depth to reflect actual syntactic braces.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gsdDir = join(__dirname, "..");

/** Files exempt from the raw-stderr/console check */
const EXEMPT_FILES = new Set([
  "workflow-logger.ts",       // The logger itself
  "debug-logger.ts",          // Separate opt-in debug system
]);

/**
 * Files that have been fully migrated to workflow-logger and must not
 * regress to empty catch blocks. Covers auto-mode, tools, bootstrap,
 * and core infrastructure files.
 */
const MIGRATED_FILES = new Set([
  // auto-mode (detected dynamically below)
  // tools/
  "tools/complete-task.ts",
  "tools/complete-slice.ts",
  "tools/complete-milestone.ts",
  "tools/plan-milestone.ts",
  "tools/plan-slice.ts",
  "tools/plan-task.ts",
  "tools/reassess-roadmap.ts",
  "tools/reopen-task.ts",
  "tools/reopen-slice.ts",
  "tools/replan-slice.ts",
  "tools/validate-milestone.ts",
  // bootstrap/
  "bootstrap/agent-end-recovery.ts",
  "bootstrap/system-context.ts",
  "bootstrap/db-tools.ts",
  "bootstrap/dynamic-tools.ts",
  "bootstrap/journal-tools.ts",
  // core infrastructure
  "gsd-db.ts",
  "workflow-logger.ts",
  "workflow-reconcile.ts",
  "workflow-migration.ts",
  "workflow-projections.ts",
  "workflow-events.ts",
  "worktree-manager.ts",
  "parallel-orchestrator.ts",
  "parallel-merge.ts",
  "guided-flow.ts",
  "preferences.ts",
  "commands-maintenance.ts",
  "commands-inspect.ts",
  "safe-fs.ts",
  "markdown-renderer.ts",
  "md-importer.ts",
  "milestone-actions.ts",
  "milestone-ids.ts",
  "rule-registry.ts",
  "custom-verification.ts",
  "prompt-loader.ts",
  "auto-verification.ts",
]);

/** Patterns that indicate a catch block already uses workflow-logger */
const LOGGER_PATTERNS = [
  /logWarning\s*\(/,
  /logError\s*\(/,
];

function getAutoModeFiles(): string[] {
  const files: string[] = [];

  // Top-level auto*.ts files
  for (const f of readdirSync(gsdDir)) {
    if (f.startsWith("auto") && f.endsWith(".ts") && !f.endsWith(".test.ts")) {
      files.push(join(gsdDir, f));
    }
  }

  // auto/ subdirectory
  const autoSubDir = join(gsdDir, "auto");
  for (const f of readdirSync(autoSubDir)) {
    if (f.endsWith(".ts") && !f.endsWith(".test.ts")) {
      files.push(join(autoSubDir, f));
    }
  }

  return files;
}

function getGsdSourceFiles(): string[] {
  const files: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === "tests" || entry === "node_modules") continue;
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
        } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts") && !entry.endsWith(".d.ts")) {
          files.push(full);
        }
      } catch {
        continue;
      }
    }
  }

  walk(gsdDir);
  return files;
}

/**
 * Strip string literals (single/double/template), regex literals, and
 * comments from TypeScript source, replacing their contents with
 * neutral characters ('X' for token bodies, ' ' for comments) while
 * preserving line structure so reported line numbers still match the
 * original source.
 *
 * This is a best-effort lexer, not a full TypeScript parser. It handles:
 *  - // line comments
 *  - \/* block comments *\/
 *  - "double" and 'single' quoted strings (including backslash escapes)
 *  - `template literals` including ${…} interpolations
 *  - /regex/ literals, heuristically distinguished from division by
 *    inspecting the last non-whitespace token
 *
 * What it does NOT do: parse JSX, full TS type syntax, or nested generics.
 * None of that matters for brace-depth correctness in catch-block scanning.
 */
function stripLiteralsAndComments(src: string): string {
  const out: string[] = new Array(src.length);
  let i = 0;
  // Track last non-whitespace, non-neutralized char to decide whether '/'
  // is a regex literal (after `(`, `,`, `=`, `!`, `?`, `:`, `&`, `|`, `;`,
  // `{`, `}`, `[`, newline, or start-of-file) or a division operator.
  let prevSignificant = "";

  function copy(from: number, to: number): void {
    for (let k = from; k < to; k++) out[k] = src[k];
  }

  function neutralize(from: number, to: number, keepNewlines = true): void {
    for (let k = from; k < to; k++) {
      const ch = src[k];
      out[k] = ch === "\n" && keepNewlines ? "\n" : ch === "\r" ? "\r" : " ";
    }
  }

  // Template-literal depth stack: when we enter ${ inside a template we push
  // onto a stack so the matching '}' closes the interpolation, not a JS block.
  const templateStack: number[] = [];

  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      neutralize(start, i);
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      const start = i;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i = Math.min(src.length, i + 2);
      neutralize(start, i);
      continue;
    }
    // String literal — single or double
    if (ch === '"' || ch === "'") {
      const quote = ch;
      const start = i;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) { i += 2; continue; }
        if (src[i] === "\n") break; // unterminated line — bail gracefully
        i++;
      }
      if (src[i] === quote) i++;
      neutralize(start, i);
      prevSignificant = "x"; // literal counts as value
      continue;
    }
    // Template literal
    if (ch === "`") {
      const start = i;
      i++;
      while (i < src.length && src[i] !== "`") {
        if (src[i] === "\\" && i + 1 < src.length) { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          // Neutralize everything up to but not including the `${`
          neutralize(start, i);
          // Copy `${` as-is, then recurse by tracking depth in templateStack
          out[i] = "$"; out[i + 1] = "{";
          i += 2;
          templateStack.push(1);
          // Return to the outer loop to scan the interpolation normally
          prevSignificant = "{";
          // resume main loop
          // We break out of the inner string scan so the outer scanner handles
          // the `${…}` body, and re-enters template scanning when it sees `}`
          // that closes the interpolation.
          break;
        }
        i++;
      }
      if (src[i] === "`") {
        neutralize(start, i + 1);
        i++;
        prevSignificant = "x";
      }
      continue;
    }
    // Regex literal heuristic — '/' starts a regex only if prevSignificant
    // is one of the contexts where a value is expected.
    if (ch === "/") {
      const regexContexts = new Set([
        "", "(", ",", "=", "!", "?", ":", "&", "|", ";", "{", "}", "[", "\n", "+", "-", "*", "%", "<", ">", "~", "^",
      ]);
      if (regexContexts.has(prevSignificant)) {
        const start = i;
        i++;
        let inClass = false;
        while (i < src.length) {
          const c = src[i];
          if (c === "\\" && i + 1 < src.length) { i += 2; continue; }
          if (c === "[") inClass = true;
          else if (c === "]") inClass = false;
          else if (c === "/" && !inClass) { i++; break; }
          else if (c === "\n") break;
          i++;
        }
        // Consume flags (i, g, m, s, u, y, d)
        while (i < src.length && /[a-z]/.test(src[i])) i++;
        neutralize(start, i);
        prevSignificant = "x";
        continue;
      }
    }
    // Inside a template interpolation — check if this `}` closes it
    if (ch === "}" && templateStack.length > 0) {
      const depth = templateStack[templateStack.length - 1];
      if (depth === 1) {
        templateStack.pop();
        out[i] = "}"; // keep it for balance
        i++;
        prevSignificant = "}";
        // Resume template-literal scanning from after the `}`
        const start = i;
        while (i < src.length && src[i] !== "`") {
          if (src[i] === "\\" && i + 1 < src.length) { i += 2; continue; }
          if (src[i] === "$" && src[i + 1] === "{") {
            neutralize(start, i);
            out[i] = "$"; out[i + 1] = "{";
            i += 2;
            templateStack.push(1);
            break;
          }
          i++;
        }
        if (src[i] === "`") {
          neutralize(start, i + 1);
          i++;
          prevSignificant = "x";
        }
        continue;
      } else {
        templateStack[templateStack.length - 1] = depth - 1;
      }
    } else if (ch === "{" && templateStack.length > 0) {
      templateStack[templateStack.length - 1] += 1;
    }

    // Regular char — keep as-is
    out[i] = ch;
    if (!/\s/.test(ch)) prevSignificant = ch;
    i++;
  }

  // Fill any undefined positions (can happen if we bailed mid-string)
  for (let k = 0; k < src.length; k++) {
    if (out[k] === undefined) out[k] = src[k] === "\n" ? "\n" : " ";
  }
  return out.join("");
}

/**
 * Scan a file for empty catch blocks — catches whose body contains
 * only whitespace and/or comments but no executable statements.
 *
 * Operates on the stripped source so string/template/regex/comment
 * contents can't fool the brace counter (#4836).
 */
function findEmptyCatches(filePath: string): Array<{ line: number; text: string }> {
  const content = readFileSync(filePath, "utf-8");
  const stripped = stripLiteralsAndComments(content);
  const origLines = content.split("\n");
  const strippedLines = stripped.split("\n");
  const results: Array<{ line: number; text: string }> = [];
  const catchHead = /(?<![A-Za-z0-9_$])catch\s*(\([^)]*\))?\s*\{/;

  for (let i = 0; i < strippedLines.length; i++) {
    const stripLine = strippedLines[i];
    const m = stripLine.match(catchHead);
    if (!m) continue;

    // Inline single-line catch: catch { ... }
    const inlineMatch = stripLine.match(/(?<![A-Za-z0-9_$])catch\s*(\([^)]*\))?\s*\{([^{}]*)\}\s*;?\s*$/);
    if (inlineMatch) {
      const body = inlineMatch[2].trim();
      if (!body) {
        results.push({ line: i + 1, text: origLines[i].trim() });
      }
      continue;
    }

    // Multi-line catch — walk the stripped source character-by-character,
    // tracking real brace depth. Starts at 1 (the `{` we just saw).
    // Compute absolute offset of the opening brace on this line.
    const braceColOnLine = stripLine.indexOf("{", stripLine.indexOf("catch"));
    if (braceColOnLine < 0) continue;
    let absOffset = 0;
    for (let k = 0; k < i; k++) absOffset += strippedLines[k].length + 1;
    absOffset += braceColOnLine + 1; // first char after `{`

    let depth = 1;
    let bodyEnd = absOffset;
    while (bodyEnd < stripped.length && depth > 0) {
      const c = stripped[bodyEnd];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth === 0) break;
      bodyEnd++;
    }
    const bodyText = stripped.slice(absOffset, bodyEnd).trim();
    if (bodyText === "") {
      results.push({ line: i + 1, text: origLines[i].trim() });
    }
  }

  return results;
}

/**
 * Scan a file for catch blocks that use raw process.stderr.write or
 * console.error/warn instead of workflow-logger.
 *
 * Operates on the stripped source so a catch body that contains (say) a
 * string literal mentioning "console.error" is not flagged (#4836).
 */
function findRawStderrCatches(filePath: string): Array<{ line: number; text: string }> {
  const content = readFileSync(filePath, "utf-8");
  const stripped = stripLiteralsAndComments(content);
  const origLines = content.split("\n");
  const strippedLines = stripped.split("\n");
  const results: Array<{ line: number; text: string }> = [];
  const catchHead = /(?<![A-Za-z0-9_$])catch\s*(\([^)]*\))?\s*\{/;

  for (let i = 0; i < strippedLines.length; i++) {
    const stripLine = strippedLines[i];
    if (!catchHead.test(stripLine)) continue;

    const inlineMatch = stripLine.match(/(?<![A-Za-z0-9_$])catch\s*(\([^)]*\))?\s*\{([^{}]*)\}\s*;?\s*$/);
    if (inlineMatch) {
      const body = inlineMatch[2];
      if (!LOGGER_PATTERNS.some((p) => p.test(body))) {
        if (/process\.stderr\.write/.test(body) || /console\.(error|warn)/.test(body)) {
          results.push({ line: i + 1, text: origLines[i].trim() });
        }
      }
      continue;
    }

    const braceColOnLine = stripLine.indexOf("{", stripLine.indexOf("catch"));
    if (braceColOnLine < 0) continue;
    let absOffset = 0;
    for (let k = 0; k < i; k++) absOffset += strippedLines[k].length + 1;
    absOffset += braceColOnLine + 1;

    let depth = 1;
    let bodyEnd = absOffset;
    while (bodyEnd < stripped.length && depth > 0) {
      const c = stripped[bodyEnd];
      if (c === "{") depth++;
      else if (c === "}") depth--;
      if (depth === 0) break;
      bodyEnd++;
    }
    const bodyText = stripped.slice(absOffset, bodyEnd);
    if (!LOGGER_PATTERNS.some((p) => p.test(bodyText))) {
      if (/process\.stderr\.write/.test(bodyText) || /console\.(error|warn)/.test(bodyText)) {
        results.push({ line: i + 1, text: origLines[i].trim() });
      }
    }
  }

  return results;
}

// ── Self-tests for the scanner — prove the brace counter is now robust ──

describe("silent-catch scanner — string/template/comment robustness (#4836)", () => {
  test("ignores '{' and '}' inside string literals", () => {
    const src = [
      'try { foo(); } catch {',
      '  const s = "}"; // closing brace in a string must not end the block',
      '  doSomething(s);',
      '}',
    ].join("\n");
    const stripped = stripLiteralsAndComments(src);
    // After stripping, the string "}" must be replaced with neutral chars,
    // so naive brace counting on the *stripped* source terminates at the
    // real closing brace, not at the in-string '}'.
    const catchIdx = stripped.indexOf("catch");
    const openIdx = stripped.indexOf("{", catchIdx);
    let depth = 1, end = openIdx + 1;
    while (end < stripped.length && depth > 0) {
      if (stripped[end] === "{") depth++;
      else if (stripped[end] === "}") depth--;
      if (depth === 0) break;
      end++;
    }
    assert.equal(depth, 0, "scanner must terminate on the real closing brace");
    // And the body must contain `doSomething(s)` — i.e. we didn't stop early.
    assert.ok(stripped.slice(openIdx + 1, end).includes("doSomething"));
  });

  test("ignores '{' inside template literal interpolations at the outer level", () => {
    // The inner `${x}` is an interpolation — its braces are real, and the
    // scanner must treat them as balanced (neither opening nor stranding
    // the catch block).
    const src = [
      'try { foo(); } catch {',
      '  const t = `x=${x + 1}`;',
      '  doSomething(t);',
      '}',
    ].join("\n");
    const stripped = stripLiteralsAndComments(src);
    const catchIdx = stripped.indexOf("catch");
    const openIdx = stripped.indexOf("{", catchIdx);
    let depth = 1, end = openIdx + 1;
    while (end < stripped.length && depth > 0) {
      if (stripped[end] === "{") depth++;
      else if (stripped[end] === "}") depth--;
      if (depth === 0) break;
      end++;
    }
    assert.equal(depth, 0, "scanner must balance template interpolation braces");
    assert.ok(stripped.slice(openIdx + 1, end).includes("doSomething"));
  });

  test("ignores '{' and '}' inside block comments", () => {
    const src = [
      'try { foo(); } catch {',
      '  /* stray } brace in a comment */',
      '  doSomething();',
      '}',
    ].join("\n");
    const stripped = stripLiteralsAndComments(src);
    // The comment body must be neutralized — no residual '}' from it.
    const openIdx = stripped.indexOf("{", stripped.indexOf("catch"));
    let depth = 1, end = openIdx + 1;
    while (end < stripped.length && depth > 0) {
      if (stripped[end] === "{") depth++;
      else if (stripped[end] === "}") depth--;
      if (depth === 0) break;
      end++;
    }
    assert.equal(depth, 0);
    assert.ok(stripped.slice(openIdx + 1, end).includes("doSomething"));
  });

  test("does not flag a catch whose body contains only a string mentioning console.error", () => {
    // If the catch body is `const x = "console.error(foo)"` then we should
    // NOT flag it as a raw-stderr violation.
    const src = [
      'try { foo(); } catch {',
      '  const x = "console.error(foo)";',
      '  void x;',
      '}',
    ].join("\n");
    const stripped = stripLiteralsAndComments(src);
    assert.ok(!/console\.(error|warn)/.test(stripped),
      "stripped body must not contain console.error after string neutralization");
  });
});

describe("workflow-logger coverage (#3348)", () => {
  test("no empty catch blocks remain in migrated files", () => {
    // Combine auto-mode files + explicitly migrated files
    const autoFiles = getAutoModeFiles();
    const allFiles = getGsdSourceFiles();
    const migratedPaths = new Set(autoFiles);
    for (const file of allFiles) {
      const rel = relative(gsdDir, file);
      if (MIGRATED_FILES.has(rel)) {
        migratedPaths.add(file);
      }
    }

    assert.ok(migratedPaths.size > 0, "should find migrated source files");

    const violations: string[] = [];
    for (const file of migratedPaths) {
      const rel = relative(gsdDir, file);
      const basename = rel.split("/").pop()!;
      // gsd-db.ts has intentionally silent provider probes
      if (basename === "gsd-db.ts" || basename === "session-lock.ts") continue;

      const empties = findEmptyCatches(file);
      for (const empty of empties) {
        violations.push(`${rel}:${empty.line} — ${empty.text}`);
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} empty catch block(s) in migrated files:\n${violations.join("\n")}`,
    );
  });

  test("catch blocks use workflow-logger instead of raw stderr/console", () => {
    const files = getGsdSourceFiles();
    assert.ok(files.length > 0, "should find GSD source files");

    const violations: string[] = [];
    for (const file of files) {
      const rel = relative(gsdDir, file);
      const basename = rel.split("/").pop()!;
      if (EXEMPT_FILES.has(basename)) continue;

      const issues = findRawStderrCatches(file);
      for (const issue of issues) {
        violations.push(`${rel}:${issue.line} — ${issue.text}`);
      }
    }

    assert.equal(
      violations.length,
      0,
      `Found ${violations.length} catch block(s) using raw stderr/console instead of workflow-logger:\n${violations.join("\n")}`,
    );
  });
});
