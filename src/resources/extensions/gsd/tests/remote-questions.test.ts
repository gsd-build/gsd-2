import test from "node:test";
import assert from "node:assert/strict";
import { parseSlackReply, parseDiscordResponse } from "../../remote-questions/format.ts";
import { resolveRemoteConfig } from "../../remote-questions/config.ts";

const originalEnv = { ...process.env };

test("parseSlackReply handles single-number single-question answers", () => {
  const result = parseSlackReply("2", [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseSlackReply handles multiline multi-question answers", () => {
  const result = parseSlackReply("1\ncustom note", [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [
        { label: "Alpha", description: "A" },
        { label: "Beta", description: "B" },
      ],
    },
    {
      id: "second",
      header: "Second",
      question: "Explain",
      allowMultiple: false,
      options: [
        { label: "Gamma", description: "G" },
        { label: "Delta", description: "D" },
      ],
    },
  ]);

  assert.deepEqual(result, {
    answers: {
      first: { answers: ["Alpha"] },
      second: { answers: [], user_note: "custom note" },
    },
  });
});

test("parseDiscordResponse handles single-question reactions", () => {
  const result = parseDiscordResponse([{ emoji: "2️⃣", count: 1 }], null, [{
    id: "choice",
    header: "Choice",
    question: "Pick one",
    allowMultiple: false,
    options: [
      { label: "Alpha", description: "A" },
      { label: "Beta", description: "B" },
    ],
  }]);

  assert.deepEqual(result, { answers: { choice: { answers: ["Beta"] } } });
});

test("parseDiscordResponse rejects multi-question reaction parsing", () => {
  const result = parseDiscordResponse([{ emoji: "1️⃣", count: 1 }], null, [
    {
      id: "first",
      header: "First",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Alpha", description: "A" }],
    },
    {
      id: "second",
      header: "Second",
      question: "Pick one",
      allowMultiple: false,
      options: [{ label: "Beta", description: "B" }],
    },
  ]);

  assert.match(String(result.answers.first.user_note), /single-question prompts/i);
  assert.match(String(result.answers.second.user_note), /single-question prompts/i);
});

test("resolveRemoteConfig clamps invalid timeout and poll interval values", async () => {
  process.env.SLACK_BOT_TOKEN = "token";
  const home = process.env.HOME!;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const prefsPath = path.join(home, ".gsd", "preferences.md");
  fs.mkdirSync(path.dirname(prefsPath), { recursive: true });
  fs.writeFileSync(prefsPath, `---\nremote_questions:\n  channel: slack\n  channel_id: \"C123\"\n  timeout_minutes: 999\n  poll_interval_seconds: 0\n---\n`, "utf-8");

  const config = resolveRemoteConfig();
  assert.ok(config);
  assert.equal(config?.timeoutMs, 30 * 60 * 1000);
  assert.equal(config?.pollIntervalMs, 2 * 1000);

  process.env = { ...originalEnv };
});
