/**
 * Tests that the @gsd/native package.json is correctly configured
 * for Node.js module resolution (ESM/CJS compatibility).
 *
 * Regression test for #2861: "type": "module" + "import"-only export
 * conditions caused crashes on Node.js v24 when the parent package also
 * declared "type": "module" and strict ESM resolution was enforced.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.resolve(__dirname, "..", "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));

describe("@gsd/native module compatibility (#2861)", () => {
  test("package.json must not declare type: module (compiled output is CJS-compatible)", () => {
    // The compiled output uses createRequire() to load .node addons.
    // Declaring "type": "module" forces Node.js to treat .js files as ESM,
    // but the package needs "type": "commonjs" to override the parent
    // package's "type": "module" and ensure correct CJS semantics.
    assert.notEqual(
      pkg.type,
      "module",
      'package.json must not set "type": "module" — this causes crashes on Node.js v24 ' +
        "when the parent package also declares ESM (see #2861)",
    );
  });

  test("package.json should explicitly declare type: commonjs", () => {
    // When installed as a dependency under a parent with "type": "module"
    // (e.g. gsd-pi), an absent "type" field would inherit the parent's
    // ESM setting. Explicit "commonjs" overrides this.
    assert.equal(
      pkg.type,
      "commonjs",
      'package.json must explicitly set "type": "commonjs" to override ' +
        "the parent package's ESM declaration",
    );
  });

  test("all export conditions must use 'default' (not 'import'-only)", () => {
    // The "import" condition key restricts resolution to ESM import
    // statements only. Using "default" ensures the export works for both
    // require() and import, which is essential for a CJS package that may
    // be consumed from ESM code via Node's CJS interop.
    const exportsMap = pkg.exports;
    assert.ok(exportsMap, "package.json must have an exports map");

    for (const [subpath, conditions] of Object.entries(exportsMap)) {
      assert.ok(
        !conditions.import || conditions.default,
        `exports["${subpath}"] uses "import" condition without "default" — ` +
          `this breaks CJS consumers and Node.js v24 strict resolution`,
      );
    }
  });

  test("native.ts source must not shadow require() with createRequire in CJS mode", () => {
    // When compiled to CJS, __dirname and require are already available.
    // Redefining them via import.meta.url (ESM-only) causes SyntaxError.
    const nativeSrc = readFileSync(
      path.resolve(__dirname, "..", "native.ts"),
      "utf8",
    );

    // The source should use __dirname directly (available in CJS) or use
    // a conditional pattern that works in both modes.
    // Check that import.meta.url is NOT used to derive __dirname
    const hasDirnameFromImportMeta = /path\.dirname\(.*fileURLToPath\(import\.meta\.url\)\)/.test(nativeSrc);
    const hasRequireFromImportMeta = /createRequire\(import\.meta\.url\)/.test(nativeSrc);

    assert.ok(
      !hasDirnameFromImportMeta,
      "native.ts must not derive __dirname from import.meta.url — " +
        "this is invalid in CJS mode and crashes with SyntaxError",
    );
    assert.ok(
      !hasRequireFromImportMeta,
      "native.ts must not create require() from import.meta.url — " +
        "require is already available in CJS scope",
    );
  });
});
