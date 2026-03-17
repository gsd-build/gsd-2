import test from "node:test";
import assert from "node:assert/strict";

import { pauseAutoForProviderError } from "../provider-error-pause.ts";

test("pauseAutoForProviderError warns and pauses without requiring ctx.log", async () => {
  const notifications: Array<{ message: string; level: string }> = [];
  let pauseCalls = 0;

  await pauseAutoForProviderError(
    {
      notify(message, level?) {
        notifications.push({ message, level: level ?? "info" });
      },
    },
    ": terminated",
    async () => {
      pauseCalls += 1;
    },
  );

  assert.equal(pauseCalls, 1, "should pause auto-mode exactly once");
  assert.deepEqual(notifications, [
    {
      message: "Auto-mode paused due to provider error: terminated",
      level: "warning",
    },
  ]);
});

test("pauseAutoForProviderError schedules auto-resume for rate limit errors", async () => {
  const notifications: Array<{ message: string; level: string }> = [];
  let pauseCalls = 0;
  let resumeCalled = false;

  // Use fake timer
  const originalSetTimeout = globalThis.setTimeout;
  const timers: Array<{ fn: () => void; delay: number }> = [];
  globalThis.setTimeout = ((fn: () => void, delay: number) => {
    timers.push({ fn, delay });
    return 0 as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;

  try {
    await pauseAutoForProviderError(
      {
        notify(message, level?) {
          notifications.push({ message, level: level ?? "info" });
        },
      },
      ": rate limit exceeded",
      async () => {
        pauseCalls += 1;
      },
      {
        isRateLimit: true,
        retryAfterMs: 90000,
        resume: () => {
          resumeCalled = true;
        },
      },
    );

    assert.equal(pauseCalls, 1, "should pause auto-mode");
    assert.equal(timers.length, 1, "should schedule one timer");
    assert.equal(timers[0].delay, 90000, "timer should match retryAfterMs");
    assert.deepEqual(notifications[0], {
      message: "Rate limited: rate limit exceeded. Auto-resuming in 90s...",
      level: "warning",
    });

    // Fire the timer
    timers[0].fn();
    assert.equal(resumeCalled, true, "should call resume after timer fires");
    assert.deepEqual(notifications[1], {
      message: "Rate limit window elapsed. Resuming auto-mode.",
      level: "info",
    });
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("pauseAutoForProviderError falls back to indefinite pause when not rate limit", async () => {
  const notifications: Array<{ message: string; level: string }> = [];
  let pauseCalls = 0;

  await pauseAutoForProviderError(
    {
      notify(message, level?) {
        notifications.push({ message, level: level ?? "info" });
      },
    },
    ": connection refused",
    async () => {
      pauseCalls += 1;
    },
    {
      isRateLimit: false,
    },
  );

  assert.equal(pauseCalls, 1);
  assert.deepEqual(notifications, [
    {
      message: "Auto-mode paused due to provider error: connection refused",
      level: "warning",
    },
  ]);
});
