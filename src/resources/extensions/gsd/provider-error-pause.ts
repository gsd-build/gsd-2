export type ProviderErrorPauseUI = {
  notify(message: string, level?: "info" | "warning" | "error" | "success"): void;
};

/**
 * Pause auto-mode due to a provider error.
 *
 * For rate-limit errors with a known reset delay, schedules an automatic
 * resume after the delay and shows a countdown notification. For all other
 * errors, pauses indefinitely (user must manually resume).
 */
export async function pauseAutoForProviderError(
  ui: ProviderErrorPauseUI,
  errorDetail: string,
  pause: () => Promise<void>,
  options?: {
    isRateLimit?: boolean;
    retryAfterMs?: number;
    resume?: () => void;
  },
): Promise<void> {
  if (options?.isRateLimit && options.retryAfterMs && options.retryAfterMs > 0 && options.resume) {
    const delaySec = Math.ceil(options.retryAfterMs / 1000);
    ui.notify(
      `Rate limited${errorDetail}. Auto-resuming in ${delaySec}s...`,
      "warning",
    );
    await pause();

    // Schedule auto-resume after the rate limit window
    setTimeout(() => {
      ui.notify("Rate limit window elapsed. Resuming auto-mode.", "info");
      options.resume!();
    }, options.retryAfterMs);
  } else {
    ui.notify(`Auto-mode paused due to provider error${errorDetail}`, "warning");
    await pause();
  }
}
