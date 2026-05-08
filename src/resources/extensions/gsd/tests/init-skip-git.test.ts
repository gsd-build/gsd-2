import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const initWizardSource = readFileSync(join(import.meta.dirname, "..", "init-wizard.ts"), "utf8");
const guidedFlowSource = readFileSync(join(import.meta.dirname, "..", "guided-flow.ts"), "utf8");

test("init wizard returns gitEnabled false when git setup is skipped", () => {
	assert.match(initWizardSource, /gitEnabled = signals\.isGitRepo/);
	assert.match(initWizardSource, /return \{ completed: true, bootstrapped: true, gitEnabled \}/);
	assert.match(initWizardSource, /if \(gitEnabled\) \{\s*ensureGitignore\(basePath\);/);
});

test("guided flow does not initialize git after the init wizard skip-git choice", () => {
	assert.match(guidedFlowSource, /skipGitBootstrap = result\.gitEnabled === false/);
	assert.match(guidedFlowSource, /if \(!skipGitBootstrap && \(!nativeIsRepo\(basePath\) \|\| isInheritedRepo\(basePath\)\)\)/);
	assert.match(guidedFlowSource, /if \(!skipGitBootstrap && nativeIsRepo\(basePath\)\) \{\s*ensureGitignore\(basePath\);/);
});
