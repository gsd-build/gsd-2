// Project/App: GSD-2
// File Purpose: Characterization tests for shared RPC golden fixture records.

import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";

import { attachJsonlLineReader, serializeJsonLine } from "../../packages/pi-coding-agent/src/modes/rpc/jsonl.ts";
import {
  rpcGoldenCommands,
  rpcGoldenEvents,
  rpcGoldenRecords,
  rpcGoldenResponses,
} from "./fixtures/rpc-golden-fixtures.ts";

test("RPC golden fixture records serialize as strict JSONL", () => {
  const jsonl = rpcGoldenRecords.map(record => serializeJsonLine(record)).join("");
  const lines = jsonl.split("\n");

  assert.equal(lines.length, rpcGoldenRecords.length + 1);
  assert.equal(lines.at(-1), "");
  for (const line of lines.slice(0, -1)) {
    assert.deepEqual(JSON.parse(line), rpcGoldenRecords[lines.indexOf(line)]);
  }
});

test("RPC golden fixture records parse through the runtime JSONL reader", async () => {
  const stream = new PassThrough();
  const parsed: unknown[] = [];
  attachJsonlLineReader(stream, line => parsed.push(JSON.parse(line)));
  const ended = new Promise<void>(resolve => stream.on("end", resolve));

  for (const record of rpcGoldenRecords) {
    stream.write(serializeJsonLine(record));
  }
  stream.end();
  await ended;

  assert.deepEqual(parsed, [...rpcGoldenRecords]);
});

test("RPC golden fixture commands cover contract-critical command types", () => {
  const commandTypes = new Set(rpcGoldenCommands.map(command => command.type));

  assert.equal(commandTypes.has("init"), true);
  assert.equal(commandTypes.has("get_state"), true);
  assert.equal(commandTypes.has("bash"), true);
  assert.equal(commandTypes.has("get_session_stats"), true);
  assert.equal(commandTypes.has("prompt"), true);
});

test("RPC golden get_state response captures current session surface", () => {
  const stateResponse = rpcGoldenResponses.find(response => response.command === "get_state");

  assert.ok(stateResponse);
  assert.equal(stateResponse.success, true);
  assert.equal(stateResponse.data.thinkingLevel, "xhigh");
  assert.equal(stateResponse.data.autoCompactionEnabled, true);
  assert.equal(stateResponse.data.autoRetryEnabled, true);
  assert.equal(stateResponse.data.retryInProgress, false);
  assert.equal(stateResponse.data.retryAttempt, 0);
  assert.equal(stateResponse.data.extensionsReady, true);
});

test("RPC golden bash response uses canonical BashResult wire shape", () => {
  const bashResponse = rpcGoldenResponses.find(response => response.command === "bash");

  assert.ok(bashResponse);
  assert.equal(bashResponse.success, true);
  assert.deepEqual(Object.keys(bashResponse.data).sort(), ["cancelled", "exitCode", "output", "truncated"]);
  assert.equal(bashResponse.data.output, "ok");
  assert.equal(bashResponse.data.exitCode, 0);
  assert.equal(bashResponse.data.cancelled, false);
  assert.equal(bashResponse.data.truncated, false);
});

test("RPC golden events cover completion and cost telemetry", () => {
  const eventTypes = new Set(rpcGoldenEvents.map(event => event.type));
  const completeEvent = rpcGoldenEvents.find(event => event.type === "execution_complete");
  const costEvent = rpcGoldenEvents.find(event => event.type === "cost_update");

  assert.deepEqual(eventTypes, new Set(["execution_complete", "cost_update"]));
  assert.equal(completeEvent?.status, "completed");
  assert.equal(costEvent?.tokens.total, undefined);
  assert.equal(costEvent?.tokens.input, 1000);
  assert.equal(costEvent?.cumulativeCost, 0.05);
});
