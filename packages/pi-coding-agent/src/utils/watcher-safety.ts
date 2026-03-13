import type { FSWatcher } from "node:fs";

export function attachWatcherErrorHandler(watcher: FSWatcher, onError?: () => void): void {
	watcher.on("error", () => {
		try {
			watcher.close();
		} catch {
			// Ignore secondary close failures for best-effort watchers.
		}
		onError?.();
	});
}
