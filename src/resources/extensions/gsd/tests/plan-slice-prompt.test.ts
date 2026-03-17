import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createTestContext } from './test-helpers.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const worktreePromptsDir = join(__dirname, "..", "prompts");

const { assertTrue, report } = createTestContext();

function loadPromptFromWorktree(name: string, vars: Record<string, string> = {}): string {
  const path = join(worktreePromptsDir, `${name}.md`);
  let content = readFileSync(path, "utf-8");
  for (const [key, value] of Object.entries(vars)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content.trim();
}

const BASE_VARS = {
  workingDirectory: "/tmp/test-project",
  milestoneId: "M001",
  sliceId: "S01",
  sliceTitle: "Test Slice",
  slicePath: ".gsd/milestones/M001/slices/S01",
  roadmapPath: ".gsd/milestones/M001/M001-ROADMAP.md",
  researchPath: ".gsd/milestones/M001/slices/S01/S01-RESEARCH.md",
  outputPath: "/tmp/test-project/.gsd/milestones/M001/slices/S01/S01-PLAN.md",
  inlinedContext: "--- test inlined context ---",
  dependencySummaries: "",
  executorContextConstraints: "",
};

async function main(): Promise<void> {

  // ─── commit_docs=true (default): commit step is present ─────────────────
  console.log("\n=== plan-slice prompt: commit_docs default (true) ===");
  {
    const commitInstruction = `Commit: \`docs(S01): add slice plan\``;
    const result = loadPromptFromWorktree("plan-slice", { ...BASE_VARS, commitInstruction });

    assertTrue(result.includes("docs(S01): add slice plan"), "commit step present when commit_docs is not false");
    assertTrue(!result.includes("Update `.gsd/STATE.md`"), "STATE.md update step removed — system rebuilds it");
    assertTrue(!result.includes("{{commitInstruction}}"), "no unresolved placeholder");
  }

  // ─── commit_docs=false: no commit step ──────────────────────────────────
  console.log("\n=== plan-slice prompt: commit_docs=false ===");
  {
    const commitInstruction = "Do not commit — planning docs are not tracked in git for this project.";
    const result = loadPromptFromWorktree("plan-slice", { ...BASE_VARS, commitInstruction });

    assertTrue(!result.includes("docs(S01): add slice plan"), "commit step absent when commit_docs=false");
    assertTrue(result.includes("Do not commit"), "no-commit instruction present");
    assertTrue(!result.includes("Update `.gsd/STATE.md`"), "STATE.md update step removed — system rebuilds it");
    assertTrue(!result.includes("{{commitInstruction}}"), "no unresolved placeholder");
  }

  // ─── all base variables are substituted ─────────────────────────────────
  console.log("\n=== plan-slice prompt: all variables substituted ===");
  {
    const commitInstruction = `Commit: \`docs(S01): add slice plan\``;
    const result = loadPromptFromWorktree("plan-slice", { ...BASE_VARS, commitInstruction });

    assertTrue(!result.includes("{{"), "no unresolved placeholders remain");
    assertTrue(result.includes("M001"), "milestoneId substituted");
    assertTrue(result.includes("S01"), "sliceId substituted");
  }
}

main().then(report);
