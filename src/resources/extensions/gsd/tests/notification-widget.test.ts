// GSD Extension — Notification Widget Tests
// Regression tests for duplicate widget rendering and stale notification display

import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  initNotificationStore,
  appendNotification,
  markAllRead,
  getUnreadCount,
  _resetNotificationStore,
} from "../notification-store.js";
import { buildNotificationWidgetLines, initNotificationWidget } from "../notification-widget.js";

describe("notification-widget", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gsd-notif-widget-test-"));
    mkdirSync(join(tmp, ".gsd"), { recursive: true });
    _resetNotificationStore();
  });

  afterEach(() => {
    _resetNotificationStore();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("buildNotificationWidgetLines returns empty when no unread notifications", () => {
    initNotificationStore(tmp);
    const lines = buildNotificationWidgetLines();
    assert.deepEqual(lines, []);
  });

  test("buildNotificationWidgetLines returns single line for unread notifications", () => {
    initNotificationStore(tmp);
    appendNotification("test message", "info");

    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1, "Widget should produce exactly one line");
    assert.match(lines[0], /1 unread/);
    assert.match(lines[0], /test message/);
  });

  test("buildNotificationWidgetLines returns empty after markAllRead", () => {
    initNotificationStore(tmp);
    appendNotification("old notification", "info");
    assert.equal(getUnreadCount(), 1);

    markAllRead();
    assert.equal(getUnreadCount(), 0);

    const lines = buildNotificationWidgetLines();
    assert.deepEqual(lines, [], "Widget should be empty after markAllRead clears stale notifications");
  });

  test("stale notifications from prior session are cleared on re-init + markAllRead", () => {
    // Simulate prior session: notifications were written to disk
    initNotificationStore(tmp);
    appendNotification("stale from last session", "info");
    appendNotification("another stale one", "warning");
    assert.equal(getUnreadCount(), 2);

    // Simulate new session: re-init + markAllRead (mirrors register-hooks.ts)
    _resetNotificationStore();
    initNotificationStore(tmp);
    markAllRead();

    assert.equal(getUnreadCount(), 0);
    const lines = buildNotificationWidgetLines();
    assert.deepEqual(lines, [], "Stale notifications should not appear in widget after session start");
  });

  test("new notifications after markAllRead are shown", () => {
    initNotificationStore(tmp);
    appendNotification("stale", "info");
    markAllRead();

    // New notification in current session
    appendNotification("fresh notification", "success");

    const lines = buildNotificationWidgetLines();
    assert.equal(lines.length, 1);
    assert.match(lines[0], /1 unread/);
    assert.match(lines[0], /fresh notification/);
  });

  test("initNotificationWidget calls setWidget exactly once", () => {
    initNotificationStore(tmp);

    let setWidgetCallCount = 0;
    const mockCtx = {
      hasUI: true,
      ui: {
        setWidget: () => { setWidgetCallCount++; },
      },
    } as any;

    initNotificationWidget(mockCtx);
    assert.equal(setWidgetCallCount, 1, "setWidget should be called exactly once to avoid duplicate renders");
  });

  test("initNotificationWidget skips when no UI", () => {
    initNotificationStore(tmp);

    let setWidgetCallCount = 0;
    const mockCtx = {
      hasUI: false,
      ui: {
        setWidget: () => { setWidgetCallCount++; },
      },
    } as any;

    initNotificationWidget(mockCtx);
    assert.equal(setWidgetCallCount, 0, "setWidget should not be called when hasUI is false");
  });
});
