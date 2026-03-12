/**
 * NDJSON (Newline-Delimited JSON) stream parser.
 * Parses Claude CLI stream-json output into typed StreamEvent objects.
 *
 * Two exports:
 * - parseNdjsonLine: pure function, parses a single line
 * - createNdjsonParser: stateful line parser that buffers partial lines and emits events via callback
 */

import type { StreamEvent } from "./chat-types";

/**
 * Parse a single NDJSON line into a StreamEvent.
 * Returns null for empty/whitespace/malformed lines (never throws).
 */
export function parseNdjsonLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed) as StreamEvent;
  } catch {
    return null;
  }
}

/**
 * Stateful NDJSON parser that buffers partial lines across chunks.
 * Call push() with each raw text chunk, and onEvent fires for each complete parsed event.
 * Call flush() when the stream ends to emit any remaining buffered content.
 */
export interface NdjsonParser {
  push(chunk: string): void;
  flush(): void;
}

export function createNdjsonParser(onEvent: (event: StreamEvent) => void): NdjsonParser {
  let buffer = "";

  return {
    push(chunk: string) {
      buffer += chunk;
      const lines = buffer.split("\n");
      // Last element is either empty (if chunk ended with \n) or an incomplete line
      buffer = lines.pop()!;
      for (const line of lines) {
        const event = parseNdjsonLine(line);
        if (event) {
          onEvent(event);
        }
      }
    },
    flush() {
      if (buffer.trim()) {
        const event = parseNdjsonLine(buffer);
        if (event) {
          onEvent(event);
        }
      }
      buffer = "";
    },
  };
}
