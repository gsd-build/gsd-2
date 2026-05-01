/**
 * Invariants for `projectRoot(ctx)`: handlers must re-resolve the project
 * root from `ctx` on every invocation.
 *
 *   1. Behavioural — calling `projectRoot(ctx)` with two different `ctx`
 *      instances in sequence returns the value bound to the ctx of that
 *      call, not a cached first-call value.
 *
 *   2. Structural — no `.ts` under `commands/handlers/` calls
 *      `process.cwd()` directly; handlers must go through
 *      `projectRoot(ctx)`.
 *
 *   3. Structural — no handler or top-level `commands-*.ts` file captures
 *      `projectRoot(...)` at module scope. Module-scope bindings would
 *      freeze the value at import time; every callsite must live inside
 *      a function body.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { projectRoot } from "../commands/context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HANDLERS_DIR = join(__dirname, "..", "commands", "handlers");
const EXT_ROOT = join(__dirname, "..");

function makeRepo(label: string): { root: string; cleanup: () => void } {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `gsd-rerresolve-${label}-`)));
  execFileSync("git", ["init", "-q"], { cwd: root });
  writeFileSync(join(root, "README.md"), `# ${label}\n`);
  // Mark as a valid GSD project for validateDirectory.
  mkdirSync(join(root, ".gsd"), { recursive: true });
  return {
    root,
    cleanup: () => {
      try { rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

describe("projectRoot(ctx) re-resolves from ctx every invocation", () => {
  test("two different ctx values in sequence return two different roots", () => {
    const a = makeRepo("a");
    const b = makeRepo("b");
    try {
      const ctxA = { cwd: a.root, projectRoot: a.root } as never;
      const ctxB = { cwd: b.root, projectRoot: b.root } as never;

      // First call binds to ctxA.
      assert.strictEqual(projectRoot(ctxA), a.root);
      // Switching ctx must surface the new root, not a cached one.
      assert.strictEqual(projectRoot(ctxB), b.root);
      // Switching back must also re-resolve, not return the most recent.
      assert.strictEqual(projectRoot(ctxA), a.root);
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });
});

describe("command surface never reaches for process.cwd() directly", () => {
  // Every handler resolves its base path through `projectRoot(ctx)` (or
  // explicitly through `ctx.cwd` when the actual invocation cwd is what's
  // wanted, e.g. resolving a user-supplied relative path). A stray
  // `process.cwd()` would silently target the wrong directory whenever
  // cwd diverges from the invocation project root.
  //
  // Comments referencing the literal "process.cwd()" are allowed; this
  // matcher only flags actual call expressions of the form `process.cwd(`.
  // To enforce the rule, we strip line and block comments before scanning.
  function findOffenders(src: string): number[] {
    const stripped = src
      // Block comments: /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      // Line comments: // ...
      .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
    const offenders: number[] = [];
    const re = /\bprocess\.cwd\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(stripped)) !== null) {
      offenders.push(stripped.slice(0, m.index).split("\n").length);
    }
    return offenders;
  }

  test("no .ts file under commands/handlers/ calls process.cwd()", () => {
    const offenders: string[] = [];
    function walk(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
          const src = readFileSync(full, "utf-8");
          for (const lineNo of findOffenders(src)) {
            offenders.push(`${full}:${lineNo}`);
          }
        }
      }
    }
    walk(HANDLERS_DIR);
    assert.deepEqual(
      offenders,
      [],
      "handlers/ must resolve project root via projectRoot(ctx) or ctx.cwd; found process.cwd() callsites",
    );
  });

  test("no commands-*.ts (top-level) file calls process.cwd()", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(EXT_ROOT, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/^commands-.*\.ts$/.test(entry.name)) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      const file = join(EXT_ROOT, entry.name);
      const src = readFileSync(file, "utf-8");
      for (const lineNo of findOffenders(src)) {
        offenders.push(`${file}:${lineNo}`);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "commands-*.ts must resolve project root via projectRoot(ctx) or ctx.cwd; found process.cwd() callsites",
    );
  });
});

describe("no handler captures projectRoot at module scope", () => {
  // A module-scope `const x = projectRoot(...)` would freeze the value at
  // import time. Permitted patterns are inside function bodies only.
  function listSources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        out.push(...listSources(full));
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        out.push(full);
      }
    }
    return out;
  }

  function isInsideFunction(src: string, callIdx: number): boolean {
    // Walk backwards counting braces to determine depth at the call site.
    // Module-scope statements have depth 0; anything inside a function body
    // has depth >= 1. This catches both `const x = projectRoot(ctx)` at the
    // top of a file and the same statement inside a function.
    let depth = 0;
    let inLineComment = false;
    let inBlockComment = false;
    let inString: '"' | "'" | "`" | null = null;
    for (let i = 0; i < callIdx; i++) {
      const ch = src[i];
      const next = src[i + 1];
      if (inLineComment) {
        if (ch === "\n") inLineComment = false;
        continue;
      }
      if (inBlockComment) {
        if (ch === "*" && next === "/") { inBlockComment = false; i++; }
        continue;
      }
      if (inString) {
        if (ch === "\\") { i++; continue; }
        if (ch === inString) inString = null;
        continue;
      }
      if (ch === "/" && next === "/") { inLineComment = true; continue; }
      if (ch === "/" && next === "*") { inBlockComment = true; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    return depth > 0;
  }

  test("handlers/ never call projectRoot() at module scope", () => {
    const offenders: string[] = [];
    for (const file of listSources(HANDLERS_DIR)) {
      const src = readFileSync(file, "utf-8");
      const re = /\bprojectRoot\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (!isInsideFunction(src, m.index)) {
          const lineNo = src.slice(0, m.index).split("\n").length;
          offenders.push(`${file}:${lineNo}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "projectRoot(...) must only be called inside function bodies — found module-scope captures",
    );
  });

  test("commands-*.ts (top-level) never call projectRoot() at module scope", () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(EXT_ROOT, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/^commands-.*\.ts$/.test(entry.name)) continue;
      if (entry.name.endsWith(".test.ts")) continue;
      const file = join(EXT_ROOT, entry.name);
      const src = readFileSync(file, "utf-8");
      const re = /\bprojectRoot\s*\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        if (!isInsideFunction(src, m.index)) {
          const lineNo = src.slice(0, m.index).split("\n").length;
          offenders.push(`${file}:${lineNo}`);
        }
      }
    }
    assert.deepEqual(
      offenders,
      [],
      "projectRoot(...) must only be called inside function bodies — found module-scope captures",
    );
  });
});
