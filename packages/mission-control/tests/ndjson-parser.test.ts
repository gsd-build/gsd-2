/**
 * Tests for NDJSON stream parser.
 * Covers: parseNdjsonLine (valid/empty/malformed) and createNdjsonParser (chunked/multi/flush).
 */
import { describe, test, expect } from "bun:test";
import { parseNdjsonLine, createNdjsonParser } from "../src/server/ndjson-parser";
import type { StreamEvent } from "../src/server/chat-types";

// -- Fixture data matching Claude CLI stream-json output --

const SYSTEM_EVENT = '{"type":"system","subtype":"init","session_id":"abc-123"}';
const ASSISTANT_EVENT = '{"type":"assistant","event":{"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}}';
const RESULT_EVENT = '{"type":"result","result":"Done.","session_id":"abc-123"}';
const STREAM_EVENT = '{"type":"stream_event","event":{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read"}}}';

// -- parseNdjsonLine tests --

describe("parseNdjsonLine", () => {
  test("valid JSON line returns parsed StreamEvent", () => {
    const result = parseNdjsonLine(SYSTEM_EVENT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("system");
    expect(result!.session_id).toBe("abc-123");
  });

  test("assistant event with delta parses correctly", () => {
    const result = parseNdjsonLine(ASSISTANT_EVENT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("assistant");
    expect(result!.event?.delta?.text).toBe("Hello");
  });

  test("result event parses correctly", () => {
    const result = parseNdjsonLine(RESULT_EVENT);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("result");
    expect(result!.result).toBe("Done.");
  });

  test("empty line returns null", () => {
    expect(parseNdjsonLine("")).toBeNull();
  });

  test("whitespace-only line returns null", () => {
    expect(parseNdjsonLine("   \t  ")).toBeNull();
  });

  test("malformed JSON returns null (no throw)", () => {
    expect(parseNdjsonLine("{broken json")).toBeNull();
    expect(parseNdjsonLine("not json at all")).toBeNull();
    expect(parseNdjsonLine("{")).toBeNull();
  });
});

// -- createNdjsonParser tests --

describe("createNdjsonParser", () => {
  /** Helper: push chunks through parser and collect output events */
  function parseChunks(chunks: string[], doFlush = true): StreamEvent[] {
    const events: StreamEvent[] = [];
    const parser = createNdjsonParser((event) => events.push(event));

    for (const chunk of chunks) {
      parser.push(chunk);
    }
    if (doFlush) {
      parser.flush();
    }

    return events;
  }

  test("chunked input split across newline boundaries yields complete events", () => {
    // Split a single JSON line across two chunks
    const fullLine = SYSTEM_EVENT;
    const mid = Math.floor(fullLine.length / 2);
    const chunk1 = fullLine.substring(0, mid);
    const chunk2 = fullLine.substring(mid) + "\n";

    const events = parseChunks([chunk1, chunk2]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("system");
  });

  test("multiple events in single chunk all emitted", () => {
    const chunk = SYSTEM_EVENT + "\n" + ASSISTANT_EVENT + "\n" + RESULT_EVENT + "\n";
    const events = parseChunks([chunk]);
    expect(events).toHaveLength(3);
    expect(events[0].type).toBe("system");
    expect(events[1].type).toBe("assistant");
    expect(events[2].type).toBe("result");
  });

  test("incomplete trailing line buffered until flush", () => {
    // Send a complete line + incomplete line, then flush
    const chunk = SYSTEM_EVENT + "\n" + RESULT_EVENT;
    const events = parseChunks([chunk]);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("system");
    expect(events[1].type).toBe("result");
  });

  test("incomplete trailing line not emitted without flush", () => {
    const chunk = SYSTEM_EVENT + "\n" + RESULT_EVENT;
    const events = parseChunks([chunk], false);
    // Only the first line (before \n) is emitted; RESULT_EVENT is still buffered
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("system");
  });

  test("empty lines between events are ignored", () => {
    const chunk = SYSTEM_EVENT + "\n\n\n" + RESULT_EVENT + "\n";
    const events = parseChunks([chunk]);
    expect(events).toHaveLength(2);
  });

  test("malformed lines in stream are skipped", () => {
    const chunk = SYSTEM_EVENT + "\n{broken}\n" + RESULT_EVENT + "\n";
    const events = parseChunks([chunk]);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("system");
    expect(events[1].type).toBe("result");
  });

  test("stream_event type with tool_use content_block", () => {
    const chunk = STREAM_EVENT + "\n";
    const events = parseChunks([chunk]);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("stream_event");
    expect(events[0].event?.content_block?.name).toBe("Read");
  });
});
