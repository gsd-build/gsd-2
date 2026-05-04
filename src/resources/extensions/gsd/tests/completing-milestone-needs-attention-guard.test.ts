import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { DISPATCH_RULES, type DispatchContext } from "../auto-dispatch.ts";

function makeBase(): string {
  const base = mkdtempSync(join(tmpdir(), "gsd-4361-"));
  const milestoneDir = join(base, ".gsd", "milestones", "M001");
  mkdirSync(join(milestoneDir, "slices", "S01"), { recursive: true });
  writeFileSync(join(milestoneDir, "M001-ROADMAP.md"), "# M001\n## Slices\n- [x] **S01: Slice** `risk:low` `depends:[]`\n");
  writeFileSync(join(milestoneDir, "slices", "S01", "S01-SUMMARY.md"), "# S01\n");
  writeFileSync(join(base, "impl.txt"), "implementation artifact");
  return base;
}

function cleanup(base: string): void {
  rmSync(base, { recursive: true, force: true });
}

function completingRule() {
  const rule = DISPATCH_RULES.find((r) => r.name === "completing-milestone → complete-milestone");
  assert.ok(rule, "completing-milestone rule must exist");
  return rule!;
}

function makeCtx(basePath: string): DispatchContext {
  return {
    basePath,
    mid: "M001",
    midTitle: "Test",
    state: { phase: "completing-milestone" } as any,
    prefs: undefined,
  };
}

test("#4361: stops completion on needs-attention with unchecked success criteria", async () => {
  const base = makeBase();
  try {
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-VALIDATION.md"),
      [
        "---",
        "verdict: needs-attention",
        "---",
        "",
        "## Success Criteria Checklist",
        "- [x] S01 done",
        "- [ ] S02 blocked",
        "- [ ] S03 blocked",
      ].join("\n"),
    );

    const result = await completingRule().match(makeCtx(base));
    assert.ok(result);
    assert.equal(result.action, "stop");
    if (result.action === "stop") {
      assert.match(result.reason, /needs-attention/i);
      assert.match(result.reason, /2 Success Criteria item\(s\) are unchecked/i);
    }
  } finally {
    cleanup(base);
  }
});

test("#4361: allows completion dispatch when needs-attention has no unchecked criteria", async () => {
  const base = makeBase();
  try {
    writeFileSync(
      join(base, ".gsd", "milestones", "M001", "M001-VALIDATION.md"),
      [
        "---",
        "verdict: needs-attention",
        "---",
        "",
        "## Success Criteria Checklist",
        "- [x] S01 done",
        "- [x] S02 documented",
      ].join("\n"),
    );

    const result = await completingRule().match(makeCtx(base));
    assert.ok(result);
    assert.equal(result.action, "dispatch");
    if (result.action === "dispatch") {
      assert.equal(result.unitType, "complete-milestone");
    }
  } finally {
    cleanup(base);
  }
});
