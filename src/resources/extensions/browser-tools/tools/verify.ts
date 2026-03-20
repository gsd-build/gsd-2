import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import type { ToolDeps } from "../state.js";

export function registerVerifyTools(pi: ExtensionAPI, deps: ToolDeps): void {
	pi.registerTool({
		name: "browser_verify",
		label: "Browser Verify",
		description:
			"Run a structured browser verification flow: navigate to a URL, run checks (element visibility, text content), capture screenshots as evidence, and return structured pass/fail results.",
		promptGuidelines: [
			"Use browser_verify for UAT verification flows that need structured evidence.",
			"Each check produces a pass/fail result with captured evidence.",
			"Prefer this over manual navigation + assertion sequences for verification tasks.",
		],
		parameters: Type.Object({
			url: Type.String({ description: "URL to navigate to" }),
			checks: Type.Array(
				Type.Object({
					description: Type.String({ description: "What this check verifies" }),
					selector: Type.Optional(Type.String({ description: "CSS selector to check" })),
					expectedText: Type.Optional(Type.String({ description: "Expected text content" })),
					expectedVisible: Type.Optional(Type.Boolean({ description: "Whether element should be visible" })),
					screenshot: Type.Optional(Type.Boolean({ description: "Capture screenshot as evidence" })),
				}),
				{ description: "Verification checks to run" },
			),
			timeout: Type.Optional(Type.Number({ description: "Navigation timeout in ms", default: 10000 })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			const startTime = Date.now();
			const { page } = await deps.ensureBrowser();
			const timeout = params.timeout ?? 10000;

			try {
				await page.goto(params.url, { waitUntil: "domcontentloaded", timeout });
			} catch (navErr) {
				const msg = navErr instanceof Error ? navErr.message : String(navErr);
				return {
					content: [{ type: "text" as const, text: `Navigation failed: ${msg}` }],
					details: {
						url: params.url,
						passed: false,
						checks: params.checks.map((c) => ({ description: c.description, passed: false, error: msg })),
						duration: Date.now() - startTime,
					},
				};
			}

			const results: Array<{
				description: string;
				passed: boolean;
				actual?: string;
				evidence?: string;
				error?: string;
			}> = [];

			for (const check of params.checks) {
				try {
					let passed = true;
					let actual: string | undefined;
					let evidence: string | undefined;

					if (check.selector) {
						const element = await page.$(check.selector);

						if (check.expectedVisible !== undefined) {
							const isVisible = element ? await element.isVisible() : false;
							passed = isVisible === check.expectedVisible;
							actual = `visible=${isVisible}`;
						}

						if (check.expectedText !== undefined && element) {
							const text = await element.textContent();
							passed = passed && (text?.includes(check.expectedText) ?? false);
							actual = `text="${text?.slice(0, 200)}"`;
						}

						if (!element && (check.expectedVisible === true || check.expectedText)) {
							passed = false;
							actual = "element not found";
						}
					}

					if (check.screenshot) {
						try {
							const buf = await page.screenshot({ type: "png" });
							evidence = `screenshot captured (${buf.length} bytes)`;
						} catch {
							evidence = "screenshot failed";
						}
					}

					results.push({ description: check.description, passed, actual, evidence });
				} catch (checkErr) {
					results.push({
						description: check.description,
						passed: false,
						error: checkErr instanceof Error ? checkErr.message : String(checkErr),
					});
				}
			}

			const allPassed = results.every((r) => r.passed);
			const summary = results.map((r) => `${r.passed ? "PASS" : "FAIL"}: ${r.description}${r.actual ? ` (${r.actual})` : ""}${r.error ? ` — ${r.error}` : ""}`).join("\n");
			return {
				content: [{ type: "text" as const, text: `Verification ${allPassed ? "PASSED" : "FAILED"} (${results.filter(r => r.passed).length}/${results.length})\n\n${summary}` }],
				details: {
					url: params.url,
					passed: allPassed,
					checks: results,
					duration: Date.now() - startTime,
				},
			};
		},
	});
}
