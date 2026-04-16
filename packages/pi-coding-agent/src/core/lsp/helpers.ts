/**
 * Local helpers replacing @oh-my-pi/pi-utils and tool-errors/tool-timeouts imports.
 */

export class ToolAbortError extends Error {
	constructor() {
		super("Tool execution aborted");
		this.name = "ToolAbortError";
	}
}

export function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new ToolAbortError();
	}
}

export function isEnoent(err: unknown): boolean {
	return (err as any)?.code === "ENOENT";
}

export function isRecord(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function clampTimeout(timeout?: number): number {
	return Math.max(5, Math.min(60, timeout ?? 20));
}

/**
 * Run a promise, rejecting if the signal aborts.
 */
export async function untilAborted<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
	if (signal?.aborted) {
		throw new ToolAbortError();
	}
	if (!signal) {
		return fn();
	}
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new ToolAbortError());
		signal.addEventListener("abort", onAbort, { once: true });
		fn().then(
			result => {
				signal.removeEventListener("abort", onAbort);
				resolve(result);
			},
			err => {
				signal.removeEventListener("abort", onAbort);
				reject(err);
			},
		);
	});
}
