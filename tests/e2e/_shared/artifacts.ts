/**
 * GSD-2 e2e harness: artifact collection.
 *
 * Each e2e test gets a unique artifacts directory. Logs, screenshots, and
 * traces written here are uploaded by CI on failure. Locally they help
 * post-mortem a flake without re-running the test.
 *
 * Configure with E2E_ARTIFACTS_DIR (defaults to ./test-results/e2e under cwd).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

function rootArtifactsDir(): string {
	return resolve(process.env.E2E_ARTIFACTS_DIR ?? join(process.cwd(), "test-results", "e2e"));
}

export interface ArtifactSink {
	dir: string;
	write: (filename: string, content: string | Buffer) => string;
}

/**
 * Create an artifacts directory for a single test. The slug is sanitized
 * to be path-safe across platforms. Returns the dir + a writer.
 */
export function artifactsFor(testSlug: string): ArtifactSink {
	const safe = testSlug.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 80);
	const dir = join(rootArtifactsDir(), `${Date.now()}_${safe}`);
	mkdirSync(dir, { recursive: true });
	return {
		dir,
		write: (filename, content) => {
			const safeName = filename.replace(/[^a-zA-Z0-9_.-]+/g, "_");
			const abs = join(dir, safeName);
			writeFileSync(abs, content);
			return abs;
		},
	};
}
