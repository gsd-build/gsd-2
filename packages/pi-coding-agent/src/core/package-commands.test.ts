import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, it } from "node:test";
import { runPackageCommand } from "./package-commands.js";

function createCaptureStream() {
	let output = "";
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			output += chunk.toString();
			callback();
		},
	}) as unknown as NodeJS.WriteStream;
	return { stream, getOutput: () => output };
}

function writePackage(root: string, files: Record<string, string>): void {
	for (const [relPath, content] of Object.entries(files)) {
		const abs = join(root, relPath);
		mkdirSync(join(abs, ".."), { recursive: true });
		writeFileSync(abs, content, "utf-8");
	}
}

describe("runPackageCommand lifecycle hooks", () => {
	it("executes registered beforeInstall and afterInstall handlers for local packages", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-lifecycle-install-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-registered");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-registered",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `
					import { writeFileSync } from "node:fs";
					import { join } from "node:path";
					export default function (pi) {
						pi.registerBeforeInstall((ctx) => {
							writeFileSync(join(ctx.installedPath, "before-install-ran.txt"), "ok", "utf-8");
						});
						pi.registerAfterInstall((ctx) => {
							writeFileSync(join(ctx.installedPath, "after-install-ran.txt"), "ok", "utf-8");
						});
					}
				`,
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const result = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(result.handled, true);
			assert.equal(result.exitCode, 0);
			assert.equal(readFileSync(join(extensionDir, "before-install-ran.txt"), "utf-8"), "ok");
			assert.equal(readFileSync(join(extensionDir, "after-install-ran.txt"), "utf-8"), "ok");
			assert.ok(stdout.getOutput().includes(`Installed ${extensionDir}`));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("runs legacy named lifecycle hooks when no registered hooks exist", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-lifecycle-legacy-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-legacy");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-legacy",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `
					import { writeFileSync } from "node:fs";
					import { join } from "node:path";
					export default function () {}
					export async function beforeInstall(ctx) {
						writeFileSync(join(ctx.installedPath, "legacy-before-install.txt"), "ok", "utf-8");
					}
					export async function afterInstall(ctx) {
						writeFileSync(join(ctx.installedPath, "legacy-after-install.txt"), "ok", "utf-8");
					}
					export async function beforeRemove(ctx) {
						writeFileSync(join(ctx.installedPath, "legacy-before-remove.txt"), "ok", "utf-8");
					}
					export async function afterRemove(ctx) {
						writeFileSync(join(ctx.installedPath, "legacy-after-remove.txt"), "ok", "utf-8");
					}
				`,
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const installResult = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(installResult.handled, true);
			assert.equal(installResult.exitCode, 0);
			assert.equal(readFileSync(join(extensionDir, "legacy-before-install.txt"), "utf-8"), "ok");
			assert.equal(readFileSync(join(extensionDir, "legacy-after-install.txt"), "utf-8"), "ok");

			const removeResult = await runPackageCommand({
				appName: "pi",
				args: ["remove", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(removeResult.handled, true);
			assert.equal(removeResult.exitCode, 0);
			assert.equal(readFileSync(join(extensionDir, "legacy-before-remove.txt"), "utf-8"), "ok");
			assert.equal(readFileSync(join(extensionDir, "legacy-after-remove.txt"), "utf-8"), "ok");
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("skips lifecycle phases with no hooks declared", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-lifecycle-skip-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-empty");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-empty",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `export default function () {}`,
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const installResult = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});
			assert.equal(installResult.handled, true);
			assert.equal(installResult.exitCode, 0);

			const removeResult = await runPackageCommand({
				appName: "pi",
				args: ["remove", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});
			assert.equal(removeResult.handled, true);
			assert.equal(removeResult.exitCode, 0);
			assert.equal(stderr.getOutput().includes("Hook failed"), false);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it("fails install when manifest runtime dependency is missing", async () => {
		const root = mkdtempSync(join(tmpdir(), "pi-lifecycle-deps-"));
		const cwd = join(root, "cwd");
		const agentDir = join(root, "agent");
		const extensionDir = join(root, "ext-runtime-deps");
		mkdirSync(cwd, { recursive: true });
		mkdirSync(agentDir, { recursive: true });
		mkdirSync(extensionDir, { recursive: true });

		try {
			writePackage(extensionDir, {
				"package.json": JSON.stringify({
					name: "ext-runtime-deps",
					type: "module",
					pi: { extensions: ["./index.js"] },
				}),
				"index.js": `export default function () {}`,
				"extension-manifest.json": JSON.stringify({
					id: "ext-runtime-deps",
					name: "Runtime Dep Test",
					version: "1.0.0",
					dependencies: { runtime: ["__definitely_missing_command_for_test__"] },
				}),
			});

			const stdout = createCaptureStream();
			const stderr = createCaptureStream();
			const result = await runPackageCommand({
				appName: "pi",
				args: ["install", extensionDir],
				cwd,
				agentDir,
				stdout: stdout.stream,
				stderr: stderr.stream,
			});

			assert.equal(result.handled, true);
			assert.equal(result.exitCode, 1);
			assert.ok(stderr.getOutput().includes("Missing runtime dependencies"));
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
