/**
 * GSD-2 Studio launch-only e2e.
 *
 * Smallest possible runtime check: builds (assumed pre-built) of the Studio
 * Electron app launch into one window with the renderer DOM mounted, and
 * surface no uncaught errors during boot.
 *
 * Scope is intentionally tight per peer review — Studio has no shipped
 * features yet, so feature-level e2e tests scaffolding, not product. Once
 * Studio ships real features, expand this suite (IPC contract, renderer
 * routes, etc.) — until then, "the app starts" is the meaningful contract.
 *
 * Skipped if:
 * - studio/dist/main/index.js is missing (run `npm run build -w @gsd/studio`)
 * - playwright is not resolvable (npm ci hoists it from the root)
 * - launching electron headless fails on this platform (no DISPLAY on linux,
 *   etc — set up xvfb in CI)
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
// test/e2e/<file>.mjs → up two = studio root
const studioRoot = resolve(__dirname, "..", "..");
const mainEntry = resolve(studioRoot, "dist/main/index.js");

async function tryLoadElectron() {
	try {
		const mod = await import("playwright");
		return { _electron: mod._electron };
	} catch (err) {
		return { error: err };
	}
}

describe("studio electron launch (launch-only)", () => {
	test("app launches, renderer mounts, no uncaught errors", { timeout: 60_000 }, async (t) => {
		if (!existsSync(mainEntry)) {
			t.skip(`studio main not built; run \`npm run build -w @gsd/studio\` first (looked at ${mainEntry})`);
			return;
		}

		const loaded = await tryLoadElectron();
		if (loaded.error) {
			t.skip(`playwright not available: ${loaded.error.message}`);
			return;
		}
		const { _electron } = loaded;

		const errors = [];
		const consoleErrors = [];

		// Launch the built electron app. Args mirror what `electron <main.js>`
		// would do — we point it at the compiled main entry.
		let app;
		try {
			app = await _electron.launch({
				args: [mainEntry],
				cwd: studioRoot,
				timeout: 30_000,
			});
		} catch (err) {
			t.skip(`electron launch failed (likely missing DISPLAY/xvfb on this host): ${err.message}`);
			return;
		}

		t.after(async () => {
			try {
				await app.close();
			} catch {
				// best-effort
			}
		});

		// Subscribe to main-process errors before any windows open.
		app.process().on("error", (err) => errors.push(err));

		// Wait for the first BrowserWindow.
		const window = await app.firstWindow({ timeout: 30_000 });

		// Capture renderer-side console errors and page errors.
		window.on("console", (msg) => {
			if (msg.type() === "error") consoleErrors.push(msg.text());
		});
		window.on("pageerror", (err) => consoleErrors.push(`pageerror: ${err.message}`));

		// Renderer DOM mounted. Studio's main.tsx asserts #root exists and
		// React renders into it; if React errors out, #root will be empty.
		await window.waitForLoadState("domcontentloaded", { timeout: 15_000 });
		const rootMounted = await window.evaluate(() => {
			const root = document.getElementById("root");
			return Boolean(root && root.children.length > 0);
		});

		const windowCount = app.windows().length;

		// Brief idle period so any deferred render errors can surface.
		await new Promise((r) => setTimeout(r, 500));

		assert.equal(windowCount, 1, `expected exactly one window, got ${windowCount}`);
		assert.ok(rootMounted, "renderer #root mounted no children — React likely failed to render");
		assert.equal(
			errors.length,
			0,
			`main-process emitted errors: ${errors.map((e) => e.message ?? String(e)).join("; ")}`,
		);
		assert.equal(
			consoleErrors.length,
			0,
			`renderer surfaced console errors during boot: ${consoleErrors.join(" | ")}`,
		);
	});
});
