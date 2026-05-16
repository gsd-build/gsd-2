import test from "node:test";
import assert from "node:assert/strict";
import { classifyTraceProgress, type ExecutionTrace } from "../session-forensics.ts";

function traceWithToolCalls(toolCalls: ExecutionTrace["toolCalls"]): ExecutionTrace {
  return {
    toolCalls,
    filesWritten: [],
    filesRead: [],
    commandsRun: [],
    errors: [],
    lastReasoning: "",
    toolCallCount: toolCalls.length,
  };
}

test("classifyTraceProgress treats skill + read-only gsd_exec as reconnaissance-only", () => {
  const trace = traceWithToolCalls([
    { name: "skill", input: { name: "diagnose" }, isError: false },
    { name: "gsd_exec", input: { command: "rg -n TODO src" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, true);
});

test("classifyTraceProgress treats skill alone as reconnaissance-only", () => {
  const trace = traceWithToolCalls([
    { name: "skill", input: { name: "diagnose" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, true);
});

test("classifyTraceProgress treats read-only gsd_exec alone as reconnaissance-only", () => {
  const trace = traceWithToolCalls([
    { name: "gsd_exec", input: { command: "rg -n TODO src" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, true);
});

test("classifyTraceProgress treats empty trace as not reconnaissance-only", () => {
  const trace = traceWithToolCalls([]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, false);
});

test("classifyTraceProgress rejects mutating gsd_exec command", () => {
  const trace = traceWithToolCalls([
    { name: "gsd_exec", input: { command: "npm run build" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, false);
});

test("classifyTraceProgress rejects shell-chained gsd_exec command", () => {
  const trace = traceWithToolCalls([
    { name: "gsd_exec", input: { command: "cat file && echo x > y" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, false);
});

test("classifyTraceProgress rejects script-eval gsd_exec command", () => {
  const trace = traceWithToolCalls([
    { name: "gsd_exec", input: { command: "python -c \"import pathlib; pathlib.Path('x').write_text('y')\"" }, isError: false },
  ]);
  const result = classifyTraceProgress(trace);
  assert.equal(result.isReadOnlyReconnaissanceOnly, false);
});
