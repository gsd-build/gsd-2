/**
 * Trust-check behaviour for stdio MCP servers — assertTrustedStdioServer().
 *
 * Covers the three trust paths:
 *   (a) config `trust: true` — skips the confirm in both runtimes
 *   (b) interactive + untrusted — prompts via ctx.ui.confirm
 *   (c) auto runtime (!hasUI) + untrusted — throws a clear, actionable error
 *
 * HTTP servers are never gated. ctx is duck-typed — only `hasUI` and `ui.confirm`
 * are exercised by the function under test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { assertTrustedStdioServer } from "../index.js";

type ConfirmFn = (title: string, message: string, opts?: unknown) => Promise<boolean>;

function makeCtx(hasUI: boolean, confirm: ConfirmFn): { calls: unknown[][]; ctx: unknown } {
	const calls: unknown[][] = [];
	const ctx = {
		hasUI,
		ui: {
			confirm: async (title: string, message: string, opts?: unknown) => {
				calls.push([title, message, opts]);
				return confirm(title, message, opts);
			},
		},
	};
	return { calls, ctx };
}

const stdioServer = (overrides: Record<string, unknown> = {}) => ({
	name: "demo",
	transport: "stdio" as const,
	sourcePath: "/tmp/project/.mcp.json",
	command: "echo",
	args: ["hello"],
	...overrides,
});

test("trust:true skips the confirm in interactive runtime", async () => {
	const { calls, ctx } = makeCtx(true, async () => {
		throw new Error("confirm must not be called for a trusted server");
	});
	const result = await assertTrustedStdioServer(stdioServer({ trust: true }) as never, ctx as never);
	assert.equal(result, undefined);
	assert.equal(calls.length, 0);
});

test("trust:true skips the confirm in auto runtime", async () => {
	const { ctx } = makeCtx(false, async () => false);
	const result = await assertTrustedStdioServer(stdioServer({ trust: true }) as never, ctx as never);
	assert.equal(result, undefined);
});

test("auto runtime + untrusted stdio server throws an actionable error", async () => {
	const { ctx } = makeCtx(false, async () => false);
	await assert.rejects(
		() => assertTrustedStdioServer(stdioServer() as never, ctx as never),
		(err: Error) => {
			assert.match(err.message, /\/gsd mcp trust "demo"/);
			assert.match(err.message, /\/tmp\/project\/\.mcp\.json/);
			return true;
		},
	);
});

test("actionable error quotes server names containing spaces", async () => {
	const { ctx } = makeCtx(false, async () => false);
	await assert.rejects(
		() => assertTrustedStdioServer(stdioServer({ name: "my slow server" }) as never, ctx as never),
		(err: Error) => {
			assert.match(err.message, /\/gsd mcp trust "my slow server"/);
			return true;
		},
	);
});

test("interactive + untrusted still prompts via ctx.ui.confirm", async () => {
	const { calls, ctx } = makeCtx(true, async () => true);
	const result = await assertTrustedStdioServer(stdioServer() as never, ctx as never);
	assert.ok(typeof result === "string", "an approved server returns a non-empty trust key");
	assert.equal(calls.length, 1);
});

test("interactive + untrusted + user declines throws not-approved error", async () => {
	const { ctx } = makeCtx(true, async () => false);
	await assert.rejects(
		() => assertTrustedStdioServer(stdioServer() as never, ctx as never),
		/was not approved/,
	);
});

test("http transport is never gated regardless of trust or runtime", async () => {
	const { calls, ctx } = makeCtx(false, async () => false);
	const httpServer = {
		name: "remote",
		transport: "http" as const,
		sourcePath: "/tmp/project/.mcp.json",
		url: "https://example.com/mcp",
	};
	const result = await assertTrustedStdioServer(httpServer as never, ctx as never);
	assert.equal(result, undefined);
	assert.equal(calls.length, 0);
});

test("trust:true short-circuits before the ctx/hasUI check (no ctx required)", async () => {
	// A config-trusted server must resolve even when ctx is entirely absent —
	// the trust flag is checked before the !ctx?.hasUI auto-runtime branch.
	const result = await assertTrustedStdioServer(stdioServer({ trust: true }) as never, undefined);
	assert.equal(result, undefined);
});

test("untrusted server with no ctx throws the actionable error", async () => {
	await assert.rejects(
		() => assertTrustedStdioServer(stdioServer() as never, undefined),
		/\/gsd mcp trust "demo"/,
	);
});
