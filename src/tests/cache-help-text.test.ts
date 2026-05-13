import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { printHelp, printSubcommandHelp } = await import("../../dist/help-text.js");

function capture(fn: () => void): string {
  const chunks: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  (process.stdout as unknown as { write: (c: string) => boolean }).write = (c: string) => {
    chunks.push(c);
    return true;
  };
  try {
    fn();
  } finally {
    (process.stdout as unknown as { write: typeof orig }).write = orig;
  }
  return chunks.join("");
}

describe("help-text: cache subcommand", () => {
  it("top-level help advertises the `cache` subcommand", () => {
    const text = capture(() => printHelp("0.0.0"));
    assert.match(text, /\bcache\b.*compile cache/i);
  });

  it("`gsd cache --help` documents clear and path", () => {
    const text = capture(() => {
      const handled = printSubcommandHelp("cache", "0.0.0");
      assert.equal(handled, true, "cache help should be registered");
    });
    assert.match(text, /Usage: gsd cache/);
    assert.match(text, /\bclear\b/);
    assert.match(text, /\bpath\b/);
  });
});
