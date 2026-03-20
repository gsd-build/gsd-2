/**
 * Shared file-locking utilities built on `proper-lockfile`.
 *
 * Centralises the synchronous retry-loop and async lock/release patterns
 * that were previously duplicated across auth-storage, session-manager,
 * settings-manager, and models-json-writer.
 */

import lockfile from "proper-lockfile";

const DEFAULT_MAX_ATTEMPTS = 10;
const DEFAULT_DELAY_MS = 20;

/**
 * Acquire a synchronous file lock with retry.
 *
 * Retries up to `maxAttempts` times when the lock is held by another process
 * (ELOCKED), using a busy-wait between attempts.
 *
 * @returns A release function to unlock.
 * @throws On non-ELOCKED errors or when all attempts are exhausted.
 */
export function acquireLockSyncWithRetry(
	lockPath: string,
	maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
	delayMs: number = DEFAULT_DELAY_MS,
): () => void {
	let lastError: unknown;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return lockfile.lockSync(lockPath, { realpath: false });
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "ELOCKED" || attempt === maxAttempts) {
				throw error;
			}
			lastError = error;
			const start = Date.now();
			while (Date.now() - start < delayMs) {
				// Busy-wait to avoid changing callers to async.
			}
		}
	}

	throw (lastError as Error) ?? new Error("Failed to acquire file lock");
}

/**
 * Non-throwing variant of {@link acquireLockSyncWithRetry}.
 *
 * Returns `undefined` instead of throwing when the lock cannot be acquired,
 * allowing callers to proceed without the lock rather than losing data.
 */
export function tryAcquireLockSync(
	lockPath: string,
	maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
	delayMs: number = DEFAULT_DELAY_MS,
): (() => void) | undefined {
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return lockfile.lockSync(lockPath, { realpath: false });
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code?: unknown }).code)
					: undefined;
			if (code !== "ELOCKED" || attempt === maxAttempts) {
				// Non-fatal: proceed without lock rather than losing data
				return undefined;
			}
			const start = Date.now();
			while (Date.now() - start < delayMs) {
				// Busy-wait to avoid changing callers to async.
			}
		}
	}
	return undefined;
}

export interface AsyncLockOptions {
	/** Maximum staleness in ms before the lock is considered stale. */
	staleMs?: number;
	/** Called if the lock is compromised while held. */
	onCompromised?: (err: Error) => void;
}

/**
 * Acquire an async file lock with retries and optional staleness detection.
 *
 * Uses `proper-lockfile`'s async API with exponential-backoff retries.
 *
 * @returns A release function (async) to unlock.
 */
export async function acquireLockAsync(
	lockPath: string,
	options?: AsyncLockOptions,
): Promise<() => Promise<void>> {
	return lockfile.lock(lockPath, {
		retries: {
			retries: 10,
			factor: 2,
			minTimeout: 100,
			maxTimeout: 10000,
			randomize: true,
		},
		stale: options?.staleMs,
		onCompromised: options?.onCompromised,
	});
}
