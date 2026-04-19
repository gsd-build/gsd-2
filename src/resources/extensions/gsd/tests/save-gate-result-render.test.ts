// Regression: save_gate_result renderResult must not print "undefined: undefined"
// when `details` is stripped to `{}`. This happens under MCP external tool
// execution — the MCP protocol doesn't carry non-standard return fields, so
// Claude Code's adapter drops `details`. renderResult must fall back to the
// human-readable summary from `content[0].text` instead.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerDbTools } from '../bootstrap/db-tools.ts';

function makeMockPi() {
  const tools: any[] = [];
  return {
    registerTool: (tool: any) => tools.push(tool),
    tools,
  } as any;
}

const fakeTheme = {
  fg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function getSaveGateResultTool() {
  const pi = makeMockPi();
  registerDbTools(pi);
  const tool = pi.tools.find((t: any) => t.name === 'gsd_save_gate_result');
  assert.ok(tool, 'gsd_save_gate_result should be registered');
  return tool;
}

test('save_gate_result renderResult falls back to content text when details is empty', () => {
  const tool = getSaveGateResultTool();
  const result = {
    content: [{ type: 'text', text: 'Gate Q3 result saved: verdict=pass' }],
    details: {},
    isError: false,
  };
  const rendered = tool.renderResult(result, {}, fakeTheme);
  const text = String(rendered.content ?? rendered.text ?? rendered);
  assert.ok(
    !text.includes('undefined'),
    `rendered output must not contain "undefined" — got: ${text}`,
  );
  assert.ok(
    text.includes('Gate Q3') || text.includes('verdict=pass'),
    `rendered output should show the content summary — got: ${text}`,
  );
});

test('save_gate_result renderResult uses structured details when present', () => {
  const tool = getSaveGateResultTool();
  const result = {
    content: [{ type: 'text', text: 'Gate Q3 result saved: verdict=flag' }],
    details: { operation: 'save_gate_result', gateId: 'Q3', verdict: 'flag' },
    isError: false,
  };
  const rendered = tool.renderResult(result, {}, fakeTheme);
  const text = String(rendered.content ?? rendered.text ?? rendered);
  assert.ok(text.includes('Q3'), `expected Q3 in output — got: ${text}`);
  assert.ok(text.includes('flag'), `expected flag in output — got: ${text}`);
  assert.ok(!text.includes('undefined'), `got: ${text}`);
});

test('save_gate_result renderResult shows error from content when details.error is missing', () => {
  const tool = getSaveGateResultTool();
  const result = {
    content: [{ type: 'text', text: 'Error: Invalid gateId "Z1"' }],
    details: {},
    isError: true,
  };
  const rendered = tool.renderResult(result, {}, fakeTheme);
  const text = String(rendered.content ?? rendered.text ?? rendered);
  assert.ok(
    text.includes('Invalid gateId') || text.includes('Error'),
    `expected error text surfaced — got: ${text}`,
  );
  assert.ok(!text.includes('undefined'), `got: ${text}`);
});
