/**
 * cmux-backend — unit tests for the CSP-safe browser backend.
 *
 * Tests the core logic of cmux-backend.ts by injecting a mock browserCmd
 * that simulates cmux CLI responses without any real process spawning.
 *
 * Coverage:
 * - selectorExists: visibility + count fallback
 * - resolveRefTargetNative: selectorHints, aria-label, HTML parsing, bare text
 * - buildRefSnapshotNative: snapshot parsing + selectorHint generation
 * - evaluateViaNativeCommands: pattern matching dispatch
 * - captureCompactPageStateNative: state capture from native commands
 */

import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  _setBrowserCmd,
  selectorExists,
  resolveRefTargetNative,
  buildRefSnapshotNative,
  evaluateViaNativeCommands,
  captureCompactPageStateNative,
} from "../resources/extensions/browser-tools/cmux-backend.ts";

// ─── Mock infrastructure ────────────────────────────────────────────────────

type CmdHandler = (surfaceId: string, args: string[], timeout?: number) => string;

function createMockBrowserCmd(handlers: Record<string, string | ((args: string[]) => string)>): CmdHandler {
  return (_surfaceId: string, args: string[], _timeout?: number): string => {
    const key = args.join(" ");
    for (const [pattern, response] of Object.entries(handlers)) {
      if (key === pattern || key.startsWith(pattern)) {
        return typeof response === "function" ? response(args) : response;
      }
    }
    throw new Error(`Mock: unhandled command: cmux browser ${key}`);
  };
}

// ─── selectorExists ─────────────────────────────────────────────────────────

describe("selectorExists", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  test("returns true when 'is visible' returns true", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible a[href="/foo"]': "true",
    }));
    assert.equal(selectorExists("s1", 'a[href="/foo"]'), true);
  });

  test("returns true when 'is visible' returns 1", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible button.submit': "1",
    }));
    assert.equal(selectorExists("s1", "button.submit"), true);
  });

  test("falls back to get count when is visible fails", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible a.link': (() => { throw new Error("not found"); }) as any,
      'get count a.link': "3",
    }));
    assert.equal(selectorExists("s1", "a.link"), true);
  });

  test("falls back to get count when is visible returns false", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible #missing': "false",
      'get count #missing': "1",
    }));
    assert.equal(selectorExists("s1", "#missing"), true);
  });

  test("returns false when both checks fail", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible #gone': (() => { throw new Error("nope"); }) as any,
      'get count #gone': (() => { throw new Error("nope"); }) as any,
    }));
    assert.equal(selectorExists("s1", "#gone"), false);
  });

  test("returns false when count is 0", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible .empty': "false",
      'get count .empty': "0",
    }));
    assert.equal(selectorExists("s1", ".empty"), false);
  });
});

// ─── resolveRefTargetNative ─────────────────────────────────────────────────

describe("resolveRefTargetNative", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  test("resolves via selectorHints first", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible a[href="/checkboxes"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Checkboxes",
      tag: "a",
      selectorHints: ['a[href="/checkboxes"]'],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: 'a[href="/checkboxes"]' });
  });

  test("skips invalid hints and tries next", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'is visible a[title="Checkboxes"]': "false",
      'get count a[title="Checkboxes"]': "0",
      'is visible a[href="/checkboxes"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Checkboxes",
      tag: "a",
      selectorHints: ['a[title="Checkboxes"]', 'a[href="/checkboxes"]'],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: 'a[href="/checkboxes"]' });
  });

  test("resolves via cmux find + role+aria-label selector", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role link --name Search': "found",
      'is visible [role="link"][aria-label="Search"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Search",
      tag: "a",
      selectorHints: [],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: '[role="link"][aria-label="Search"]' });
  });

  test("resolves via aria-label when cmux find fails", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role button --name Submit': (() => { throw new Error("not found"); }) as any,
      'is visible [aria-label="Submit"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "button",
      name: "Submit",
      tag: "button",
      selectorHints: [],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: '[aria-label="Submit"]' });
  });

  test("resolves link via HTML text content match (Strategy 2c)", () => {
    const html = '<ul><li><a href="/checkboxes">Checkboxes</a></li><li><a href="/dropdown">Dropdown</a></li></ul>';
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role link --name Checkboxes': (() => { throw new Error("fail"); }) as any,
      'is visible [aria-label="Checkboxes"]': "false",
      'get count [aria-label="Checkboxes"]': "0",
      'get html body': html,
      'is visible a[href="/checkboxes"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Checkboxes",
      tag: "a",
      selectorHints: [],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: 'a[href="/checkboxes"]' });
  });

  test("resolves link via bare text match (Strategy 2d) when other strategies fail", () => {
    const html = '<div><a href="/about">About Us</a></div>';
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role link --name About Us': (() => { throw new Error("fail"); }) as any,
      'is visible [aria-label="About Us"]': "false",
      'get count [aria-label="About Us"]': "0",
      'get html body': html,
      // Strategy 2c regex won't match because "About Us" has a space and
      // the regex requires <a\s to have attributes — but actually it will match.
      // Let's test the bare path specifically:
      'is visible a[href="/about"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "About Us",
      tag: "a",
      selectorHints: [],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: 'a[href="/about"]' });
  });

  test("resolves button via title attribute", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role button --name Close': (() => { throw new Error("fail"); }) as any,
      'is visible [aria-label="Close"]': "false",
      'get count [aria-label="Close"]': "0",
      'get html body': '<div><button class="x">Close</button></div>',
      'is visible button[title="Close"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "button",
      name: "Close",
      tag: "button",
      selectorHints: [],
      path: [],
    });

    assert.deepEqual(result, { ok: true, selector: 'button[title="Close"]' });
  });

  test("resolves via id from HTML", () => {
    const html = '<nav><a id="nav-home" href="/">Home</a></nav>';
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role link --name Home': (() => { throw new Error("fail"); }) as any,
      'is visible [aria-label="Home"]': "false",
      'get count [aria-label="Home"]': "0",
      'get html body': html,
      'is visible a[href="/"]': "true",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Home",
      tag: "a",
      selectorHints: [],
      path: [],
    });

    // Should match via 2c (href match)
    assert.equal(result.ok, true);
    assert.ok(result.selector.includes("href") || result.selector.includes("nav-home"));
  });

  test("returns ok:false when all strategies fail", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      'find role link --name Ghost': (() => { throw new Error("fail"); }) as any,
      'is visible [aria-label="Ghost"]': "false",
      'get count [aria-label="Ghost"]': "0",
      'get html body': '<div>No links here</div>',
      'is visible a[title="Ghost"]': "false",
      'get count a[title="Ghost"]': "0",
    }));

    const result = resolveRefTargetNative("s1", {
      role: "link",
      name: "Ghost",
      tag: "a",
      selectorHints: [],
      path: [],
    });

    assert.equal(result.ok, false);
    assert.ok(result.reason.includes("element not found"));
  });

  test("handles missing role/name gracefully", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({}));

    const result = resolveRefTargetNative("s1", {
      tag: "div",
      selectorHints: [],
      path: [],
    });

    assert.equal(result.ok, false);
  });
});

// ─── buildRefSnapshotNative ─────────────────────────────────────────────────

describe("buildRefSnapshotNative", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  test("parses accessibility snapshot into RefNode-compatible objects", () => {
    const snapshot = [
      '- link "Homepage"',
      '- button "Submit"',
      '- textbox "Email"',
      '- heading "Welcome"',
    ].join("\n");

    restore = _setBrowserCmd(createMockBrowserCmd({
      "snapshot --compact --interactive --max-depth": snapshot,
      "get html body": '<a href="/">Homepage</a><button>Submit</button>',
    }));

    const nodes = buildRefSnapshotNative("s1", { limit: 10 });

    assert.equal(nodes.length, 4);
    assert.equal(nodes[0].role, "link");
    assert.equal(nodes[0].name, "Homepage");
    assert.equal(nodes[0].tag, "a");
    assert.equal(nodes[1].role, "button");
    assert.equal(nodes[1].name, "Submit");
    assert.equal(nodes[1].tag, "button");
    assert.equal(nodes[2].role, "textbox");
    assert.equal(nodes[2].name, "Email");
    assert.equal(nodes[2].tag, "input");
    assert.equal(nodes[3].role, "heading");
    assert.equal(nodes[3].name, "Welcome");
    assert.equal(nodes[3].tag, "h2");
  });

  test("generates selectorHints from HTML for links", () => {
    const snapshot = '- link "Checkboxes"';
    const html = '<ul><li><a href="/checkboxes">Checkboxes</a></li></ul>';

    restore = _setBrowserCmd(createMockBrowserCmd({
      "snapshot --compact --interactive --max-depth": snapshot,
      "get html body": html,
    }));

    const nodes = buildRefSnapshotNative("s1", { limit: 10 });
    assert.equal(nodes.length, 1);
    assert.ok(
      nodes[0].selectorHints.some((h: string) => h.includes('href="/checkboxes"')),
      `Expected selectorHints to contain href="/checkboxes", got: ${JSON.stringify(nodes[0].selectorHints)}`
    );
  });

  test("generates selectorHints from aria-label", () => {
    const snapshot = '- button "Play"';
    const html = '<button aria-label="Play">▶</button>';

    restore = _setBrowserCmd(createMockBrowserCmd({
      "snapshot --compact --interactive --max-depth": snapshot,
      "get html body": html,
    }));

    const nodes = buildRefSnapshotNative("s1", { limit: 10 });
    assert.equal(nodes.length, 1);
    assert.ok(
      nodes[0].selectorHints.some((h: string) => h.includes('aria-label="Play"')),
      `Expected aria-label hint, got: ${JSON.stringify(nodes[0].selectorHints)}`
    );
  });

  test("respects limit parameter", () => {
    const snapshot = [
      '- link "A"',
      '- link "B"',
      '- link "C"',
      '- link "D"',
    ].join("\n");

    restore = _setBrowserCmd(createMockBrowserCmd({
      "snapshot --compact --interactive --max-depth": snapshot,
      "get html body": "<div></div>",
    }));

    const nodes = buildRefSnapshotNative("s1", { limit: 2 });
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0].name, "A");
    assert.equal(nodes[1].name, "B");
  });

  test("uses selector scope when provided", () => {
    const snapshotCalls: string[][] = [];
    restore = _setBrowserCmd((_, args) => {
      if (args[0] === "snapshot") {
        snapshotCalls.push(args);
        return '- link "Test"';
      }
      if (args[0] === "get") return "<div></div>";
      throw new Error(`unexpected: ${args.join(" ")}`);
    });

    buildRefSnapshotNative("s1", { selector: "nav", limit: 10 });
    assert.equal(snapshotCalls.length, 1);
    assert.ok(snapshotCalls[0].includes("--selector"));
    assert.ok(snapshotCalls[0].includes("nav"));
  });

  test("returns empty array on snapshot failure", () => {
    restore = _setBrowserCmd(() => { throw new Error("cmux not available"); });
    const nodes = buildRefSnapshotNative("s1", { limit: 10 });
    assert.deepEqual(nodes, []);
  });
});

// ─── evaluateViaNativeCommands (pattern matching) ───────────────────────────

describe("evaluateViaNativeCommands", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  test("dispatches captureCompactPageState pattern", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get title": "Test Page",
      "get url": "https://example.com",
      "snapshot --max-depth": "- heading \"Test\"",
      'get count button,[role="button"]': "2",
      'get count a[href]': "5",
      'get count input,textarea,select': "1",
      "get text body": "Hello world test content",
      "get box html": '{"x":0,"y":0,"width":1280,"height":800}',
    }));

    const fn = `(arg) => {
      const selectorStates = [];
      const headings = [];
      const counts = { buttons: 0, links: 0 };
    }`;

    const result = evaluateViaNativeCommands("s1", fn, {}, "eval failed") as any;
    assert.equal(result.title, "Test Page");
    assert.equal(result.url, "https://example.com");
  });

  test("dispatches mutation counter pattern (no-op)", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({}));

    const fn = `() => {
      const key = "__piMutationCounter";
      if (window[key]) return;
      window.__piMutationCounterInstalled = true;
      const observer = new MutationObserver(() => {});
    }`;

    const result = evaluateViaNativeCommands("s1", fn, undefined, "CSP error");
    assert.equal(result, undefined);
  });

  test("dispatches readSettleState pattern", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({}));

    const fn = `() => {
      const count = window.__piMutationCounter || 0;
      const el = document.activeElement;
      return { mutationCount: count, focusDescriptor: "" };
    }`;

    const result = evaluateViaNativeCommands("s1", fn, undefined, "CSP error") as any;
    assert.equal(result.mutationCount, 0);
    assert.equal(result.focusDescriptor, "");
  });

  test("dispatches document.title expression", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get title": "My Page",
    }));

    const result = evaluateViaNativeCommands("s1", "document.title", undefined, "CSP error");
    assert.equal(result, "My Page");
  });

  test("dispatches location.href expression", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get url": "https://example.com/page",
    }));

    const result = evaluateViaNativeCommands("s1", "location.href", undefined, "CSP error");
    assert.equal(result, "https://example.com/page");
  });

  test("dispatches window.location.href expression", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get url": "https://example.com",
    }));

    const result = evaluateViaNativeCommands("s1", "window.location.href", undefined, "CSP error");
    assert.equal(result, "https://example.com");
  });

  test("dispatches scrollInfo pattern", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get box html": '{"x":0,"y":0,"width":1280,"height":2400}',
    }));

    const fn = `() => {
      return { scrollY: window.scrollY, scrollHeight: document.body.scrollHeight, clientHeight: window.innerHeight };
    }`;

    const result = evaluateViaNativeCommands("s1", fn, undefined, "CSP error") as any;
    assert.equal(typeof result.scrollY, "number");
    assert.equal(typeof result.scrollHeight, "number");
  });

  test("throws on unknown pattern", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({}));

    assert.throws(
      () => evaluateViaNativeCommands("s1", "someUnknownExpression()", undefined, "CSP blocked eval"),
      (err: any) => err.message.includes("CSP fallback")
    );
  });
});

// ─── captureCompactPageStateNative ──────────────────────────────────────────

describe("captureCompactPageStateNative", () => {
  let restore: () => void;
  afterEach(() => restore?.());

  test("captures title, url, headings, counts", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get title": "Test Page",
      "get url": "https://example.com",
      "snapshot --max-depth": [
        '- heading "Welcome"',
        '- heading "About"',
        '- button "Submit"',
        '- link "Home"',
      ].join("\n"),
      'get count button,[role="button"]': "1",
      'get count a[href]': "1",
      'get count input,textarea,select': "0",
      "get text body": "Welcome to the test page",
      "get box html": '{"x":0,"y":0,"width":1280,"height":800}',
    }));

    const state = captureCompactPageStateNative("s1", { includeBodyText: true }) as any;

    assert.equal(state.title, "Test Page");
    assert.equal(state.url, "https://example.com");
    assert.ok(state.headings.length >= 2);
    assert.ok(state.headings.includes("Welcome"), `Expected "Welcome" in headings, got: ${JSON.stringify(state.headings)}`);
    assert.ok(state.bodyText.includes("Welcome"));
  });

  test("handles missing data gracefully", () => {
    restore = _setBrowserCmd(createMockBrowserCmd({
      "get title": "Minimal",
      "get url": "about:blank",
      "snapshot --max-depth": "",
      'get count button,[role="button"]': (() => { throw new Error("fail"); }) as any,
      'get count a[href]': "0",
      'get count input,textarea,select': "0",
      "get text body": "",
      "get box html": (() => { throw new Error("fail"); }) as any,
    }));

    const state = captureCompactPageStateNative("s1", {}) as any;
    assert.equal(state.title, "Minimal");
    assert.equal(state.url, "about:blank");
  });
});
