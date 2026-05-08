/**
 * GSD-2 MCP server real-process e2e (3-tool starter).
 *
 * Spawns the @gsd-build/mcp-server CLI (`packages/mcp-server/dist/cli.js`)
 * as a subprocess via the MCP SDK's StdioClientTransport, connects a real
 * Client over stdio JSON-RPC, and exercises 3 high-traffic read-only
 * tools end-to-end:
 *
 *   - tools/list   → ensures the server enumerates registered tools
 *   - gsd_doctor   → lightweight structural health check
 *   - gsd_progress → structured project state read
 *
 * Note: this is the *orchestration* server (gsd_doctor, gsd_progress, …),
 * NOT `gsd --mode mcp` (which exposes the agent's file-edit / bash tools
 * to external clients — different surface).
 *
 * Scope intentionally narrow (3 tools) per peer review. The full 37-tool
 * conformance matrix (Phase C) builds on this once the harness pattern is
 * proven stable.
 *
 * Skip path: if the MCP SDK or built CLI is not resolvable.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { canonicalTmpdir, createTmpProject } from "./_shared/index.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// tests/e2e/<file>.ts → up two = repo root
const repoRoot = resolve(__dirname, "..", "..");
const orchestrationCli = resolve(repoRoot, "packages/mcp-server/dist/cli.js");

interface McpClient {
	connect(transport: unknown): Promise<void>;
	close(): Promise<void>;
	listTools(): Promise<{ tools: Array<{ name: string }> }>;
	callTool(args: { name: string; arguments?: Record<string, unknown> }): Promise<{
		content: Array<{ type: string; text?: string }>;
		isError?: boolean;
	}>;
}

interface StdioTransportArgs {
	command: string;
	args?: string[];
	cwd?: string;
	env?: Record<string, string>;
	stderr?: "inherit" | "ignore" | "pipe";
}

async function tryLoadMcpSdk(): Promise<
	| { ok: true; ClientCtor: new (info: { name: string; version: string }) => McpClient; TransportCtor: new (args: StdioTransportArgs) => unknown }
	| { ok: false; reason: string }
> {
	try {
		const clientMod = (await import("@modelcontextprotocol/sdk/client/index.js")) as unknown as {
			Client: new (info: { name: string; version: string }) => McpClient;
		};
		const transportMod = (await import("@modelcontextprotocol/sdk/client/stdio.js")) as unknown as {
			StdioClientTransport: new (args: StdioTransportArgs) => unknown;
		};
		return { ok: true, ClientCtor: clientMod.Client, TransportCtor: transportMod.StdioClientTransport };
	} catch (err) {
		return { ok: false, reason: `MCP SDK not resolvable: ${(err as Error).message}` };
	}
}

function cliAvailable(): { ok: boolean; reason?: string } {
	if (!existsSync(orchestrationCli)) {
		return { ok: false, reason: `orchestration MCP CLI not found at ${orchestrationCli}; run \`npm run build:mcp-server\`` };
	}
	return { ok: true };
}

describe("mcp server e2e (real-process stdio)", () => {
	const avail = cliAvailable();
	const skipReason = avail.ok ? null : avail.reason;

	test("connect, list tools, call gsd_doctor + gsd_progress against fresh project", { skip: skipReason ?? false, timeout: 60_000 }, async (t) => {
		const sdk = await tryLoadMcpSdk();
		if (!sdk.ok) {
			t.skip(sdk.reason);
			return;
		}

		// Fresh project so gsd_doctor / gsd_progress have something deterministic to read.
		const project = createTmpProject({ git: true, gsdSkeleton: true });
		t.after(project.cleanup);
		mkdirSync(join(project.dir, ".gsd", "milestones"), { recursive: true });

		const transport = new sdk.TransportCtor({
			command: process.execPath,
			args: [orchestrationCli],
			cwd: project.dir,
			env: {
				// Stripped/minimal env so a developer's local config can't leak in.
				PATH: process.env.PATH ?? "",
				HOME: process.env.HOME ?? "",
				TMPDIR: canonicalTmpdir(),
				GSD_NON_INTERACTIVE: "1",
			},
			stderr: "pipe",
		});

		const client = new sdk.ClientCtor({ name: "gsd-e2e-test", version: "0.0.0" });

		await client.connect(transport);
		t.after(async () => {
			try {
				await client.close();
			} catch {
				// best-effort
			}
		});

		// 1. tools/list must enumerate the server's registered tools.
		const list = await client.listTools();
		assert.ok(Array.isArray(list.tools), "expected tools to be an array");
		assert.ok(list.tools.length >= 10, `expected at least 10 tools, got ${list.tools.length}`);
		const toolNames = new Set(list.tools.map((t) => t.name));
		for (const required of ["gsd_doctor", "gsd_progress", "gsd_status"]) {
			assert.ok(toolNames.has(required), `tools/list missing ${required}. Got: ${[...toolNames].slice(0, 20).join(", ")}`);
		}

		// 2. gsd_doctor — read-only structural health check.
		const doctor = await client.callTool({ name: "gsd_doctor", arguments: { projectDir: project.dir }});
		assert.equal(doctor.isError, undefined, `gsd_doctor returned error: ${JSON.stringify(doctor.content)}`);
		assert.ok(Array.isArray(doctor.content) && doctor.content.length > 0, "gsd_doctor returned empty content");
		const doctorText = doctor.content
			.filter((c) => c.type === "text")
			.map((c) => c.text ?? "")
			.join("");
		assert.ok(doctorText.length > 0, "gsd_doctor returned no text payload");

		// 3. gsd_progress — structured project state read against the fresh project.
		const progress = await client.callTool({ name: "gsd_progress", arguments: { projectDir: project.dir }});
		assert.equal(progress.isError, undefined, `gsd_progress returned error: ${JSON.stringify(progress.content)}`);
		assert.ok(Array.isArray(progress.content) && progress.content.length > 0, "gsd_progress returned empty content");
	});
});
