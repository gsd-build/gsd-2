/**
 * Bash stream processor — single-pass UTF-8 decode + ANSI strip + binary sanitization.
 *
 * Handles chunk boundaries for incomplete UTF-8 and ANSI escape sequences.
 */

import { native } from "../native.js";

export interface StreamState {
  utf8Pending: number[];
  ansiPending: number[];
}

export interface StreamChunkResult {
  text: string;
  state: StreamState;
}

/**
 * Process a raw bash output chunk in a single pass.
 *
 * Decodes UTF-8 (handling incomplete multibyte sequences at boundaries),
 * strips ANSI escape sequences, removes control characters (except tab and
 * newline), removes carriage returns, and filters Unicode format characters.
 *
 * Pass the returned `state` to the next call to handle sequences split
 * across chunk boundaries.
 */
export function processStreamChunk(
  chunk: Buffer,
  state?: StreamState,
): StreamChunkResult {
  const nativeProcessStreamChunk = (native as Record<string, unknown>)
    .processStreamChunk;
  if (typeof nativeProcessStreamChunk !== "function") {
    return processStreamChunkFallback(chunk, state);
  }

  // Convert StreamState arrays to the format napi expects (Vec<u8>)
  const napiState = state
    ? {
        utf8Pending: Array.from(state.utf8Pending),
        ansiPending: Array.from(state.ansiPending),
      }
    : undefined;

  try {
    return normalizeNativeStreamResult(nativeProcessStreamChunk(chunk, napiState));
  } catch {
    return processStreamChunkFallback(chunk, state);
  }
}

function processStreamChunkFallback(
  chunk: Buffer,
  state?: StreamState,
): StreamChunkResult {
  const decoded = decodeUtf8WithPending(chunk, state?.utf8Pending ?? []);
  const stripped = stripAnsiWithPending(
    decoded.text,
    state?.ansiPending ?? [],
  );

  return {
    text: sanitizeBinaryOutputFallback(stripped.text),
    state: {
      utf8Pending: decoded.utf8Pending,
      ansiPending: stripped.ansiPending,
    },
  };
}

function decodeUtf8WithPending(
  chunk: Buffer,
  pending: number[],
): { text: string; utf8Pending: number[] } {
  const bytes =
    pending.length === 0
      ? chunk
      : Buffer.concat([Buffer.from(pending), chunk]);
  const pendingLength = incompleteUtf8SuffixLength(bytes);
  const complete =
    pendingLength === 0
      ? bytes
      : bytes.subarray(0, bytes.length - pendingLength);

  return {
    text: complete.toString("utf8"),
    utf8Pending:
      pendingLength === 0
        ? []
        : Array.from(bytes.subarray(bytes.length - pendingLength)),
  };
}

function incompleteUtf8SuffixLength(bytes: Buffer): number {
  if (bytes.length === 0) {
    return 0;
  }

  let leadIndex = bytes.length - 1;
  while (leadIndex >= 0 && isUtf8Continuation(bytes[leadIndex])) {
    leadIndex--;
  }

  if (leadIndex < 0) {
    return Math.min(bytes.length, 3);
  }

  const lead = bytes[leadIndex];
  const expectedLength = utf8SequenceLength(lead);
  if (expectedLength <= 1) {
    return 0;
  }

  const availableLength = bytes.length - leadIndex;
  return availableLength < expectedLength ? availableLength : 0;
}

function isUtf8Continuation(byte: number): boolean {
  return byte >= 0x80 && byte <= 0xbf;
}

function utf8SequenceLength(byte: number): number {
  if (byte >= 0xc2 && byte <= 0xdf) {
    return 2;
  }
  if (byte >= 0xe0 && byte <= 0xef) {
    return 3;
  }
  if (byte >= 0xf0 && byte <= 0xf4) {
    return 4;
  }
  return 1;
}

function stripAnsiWithPending(
  text: string,
  pending: number[],
): { text: string; ansiPending: number[] } {
  const input = `${Buffer.from(pending).toString("utf8")}${text}`;
  let output = "";

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);

    if (code === 0x1b) {
      const end = findAnsiSequenceEnd(input, i);
      if (end === -1) {
        return {
          text: output,
          ansiPending: Array.from(Buffer.from(input.slice(i))),
        };
      }
      i = end;
      continue;
    }

    if (code === 0x9b) {
      const end = findCsiEnd(input, i + 1);
      if (end === -1) {
        return {
          text: output,
          ansiPending: Array.from(Buffer.from(input.slice(i))),
        };
      }
      i = end;
      continue;
    }

    output += input[i];
  }

  return { text: output, ansiPending: [] };
}

function findAnsiSequenceEnd(input: string, escapeIndex: number): number {
  const nextIndex = escapeIndex + 1;
  if (nextIndex >= input.length) {
    return -1;
  }

  const next = input.charCodeAt(nextIndex);
  if (next === 0x5b) {
    return findCsiEnd(input, nextIndex + 1);
  }
  if (next === 0x5d) {
    return findStringTerminator(input, nextIndex + 1);
  }
  if (next === 0x50 || next === 0x58 || next === 0x5e || next === 0x5f) {
    return findStringTerminator(input, nextIndex + 1);
  }
  if (
    next === 0x28 ||
    next === 0x29 ||
    next === 0x2a ||
    next === 0x2b ||
    next === 0x2d ||
    next === 0x2e ||
    next === 0x2f ||
    next === 0x23
  ) {
    return nextIndex + 1 < input.length ? nextIndex + 1 : -1;
  }

  return next >= 0x40 && next <= 0x7e ? nextIndex : -1;
}

function findCsiEnd(input: string, startIndex: number): number {
  for (let i = startIndex; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0x40 && code <= 0x7e) {
      return i;
    }
  }
  return -1;
}

function findStringTerminator(input: string, startIndex: number): number {
  for (let i = startIndex; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code === 0x07) {
      return i;
    }
    if (code === 0x1b) {
      if (i + 1 >= input.length) {
        return -1;
      }
      if (input.charCodeAt(i + 1) === 0x5c) {
        return i + 1;
      }
    }
  }
  return -1;
}

function stripAnsiFallback(text: string): string {
  return stripAnsiWithPending(text, []).text;
}

function sanitizeBinaryOutputFallback(text: string): string {
  let output = "";
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code === undefined) {
      continue;
    }
    if (code === 0x09 || code === 0x0a) {
      output += char;
      continue;
    }
    if (
      code === 0x0d ||
      code < 0x20 ||
      code === 0x7f ||
      (code >= 0xfff9 && code <= 0xfffb) ||
      (code >= 0xd800 && code <= 0xdfff)
    ) {
      continue;
    }
    output += char;
  }
  return output;
}

function normalizeNativeStreamResult(result: unknown): StreamChunkResult {
  const nativeResult = result as {
    text: string;
    state: { utf8Pending: Buffer; ansiPending: Buffer };
  };

  return {
    text: nativeResult.text,
    state: {
      utf8Pending: Array.from(nativeResult.state.utf8Pending),
      ansiPending: Array.from(nativeResult.state.ansiPending),
    },
  };
}

/**
 * Strip ANSI escape sequences from a string.
 */
export function stripAnsiNative(text: string): string {
  const nativeStripAnsi = (native as Record<string, unknown>).stripAnsiNative;
  if (typeof nativeStripAnsi !== "function") {
    return stripAnsiFallback(text);
  }
  try {
    return nativeStripAnsi(text) as string;
  } catch {
    return stripAnsiFallback(text);
  }
}

/**
 * Remove binary garbage and control characters from a string.
 *
 * Keeps tab and newline. Removes carriage return, all other control
 * characters, Unicode format characters (U+FFF9-U+FFFB), and lone surrogates.
 */
export function sanitizeBinaryOutputNative(text: string): string {
  const nativeSanitizeBinaryOutput = (native as Record<string, unknown>)
    .sanitizeBinaryOutputNative;
  if (typeof nativeSanitizeBinaryOutput !== "function") {
    return sanitizeBinaryOutputFallback(text);
  }
  try {
    return nativeSanitizeBinaryOutput(text) as string;
  } catch {
    return sanitizeBinaryOutputFallback(text);
  }
}
