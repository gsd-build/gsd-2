// Project/App: GSD-2
// File Purpose: Regression tests for the interactive terminal footer renderer.

import test from "node:test";
import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { FooterComponent } from "../../packages/pi-coding-agent/src/modes/interactive/components/footer.ts";
import { initTheme } from "../../packages/pi-coding-agent/src/modes/interactive/theme/theme.ts";

initTheme("dark", false);

test("FooterComponent renders a rounded operations-console footer with extension statuses", () => {
  const footer = new FooterComponent(
    {
      state: {
        model: { id: "test-model", provider: "test", contextWindow: 1000 },
      },
      sessionManager: {
        getUsageTotals: () => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }),
        getSessionName: () => undefined,
      },
      getContextUsage: () => ({ percent: 12.5, contextWindow: 1000 }),
      getLastTurnCost: () => 0,
      modelRegistry: {
        isUsingOAuth: () => false,
        getProviderAuthMode: () => "apiKey",
      },
    } as any,
    {
      getGitBranch: () => "main",
      getExtensionStatuses: () => new Map([["one", "ready"], ["two", "synced"]]),
      getAvailableProviderCount: () => 1,
    } as any,
  );

  const lines = footer.render(160).map((line) => stripVTControlCharacters(line));

  assert.equal(lines.length, 3);
  assert.match(lines[0], /^╭─+╮$/);
  assert.match(lines[1], /^\│/);
  assert.match(lines[1], /\(main\)/);
  assert.match(lines[1], /ready synced\s*│$/);
  assert.match(lines[1], /● GSD/);
  assert.match(lines[1], /● GSD  │  .* \(main\)  │  /);
  assert.match(lines[1], /12\.5%\/1\.0k/);
  assert.match(lines[2], /^╰─+╯$/);
});
