import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { initNotificationStore, appendNotification, _resetNotificationStore } from "../notification-store.js";
import { buildNotificationWidgetLines, initNotificationWidget, _resetNotificationWidgetForTests } from "../notification-widget.js";

test("buildNotificationWidgetLines shows unread count with shortcut pair", () => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-notification-widget-"));
  try {
    mkdirSync(join(tmp, ".gsd"), { recursive: true });
    _resetNotificationStore();
    initNotificationStore(tmp);
    appendNotification("Need attention", "warning");

    const lines = buildNotificationWidgetLines();
    // Widget must render at least one line; may add secondary lines later
    // (e.g., "View with /gsd notif") without breaking this assertion.
    assert.ok(lines.length >= 1, `expected at least 1 widget line, got ${lines.length}`);
    const combined = lines.join("\n");
    assert.match(combined, /🔔\s+1 unread/);
    assert.match(combined, /\(.+\/.+\)/);
  } finally {
    _resetNotificationStore();
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("initNotificationWidget replaces prior interval and store subscription", () => {
  const tmp = mkdtempSync(join(tmpdir(), "gsd-notification-widget-"));
  const firstStatuses: Array<string | undefined> = [];
  const secondStatuses: Array<string | undefined> = [];
  try {
    mkdirSync(join(tmp, ".gsd"), { recursive: true });
    _resetNotificationStore();
    _resetNotificationWidgetForTests();
    initNotificationStore(tmp);
    appendNotification("Need attention", "warning");

    const firstCleanup = initNotificationWidget({
      hasUI: true,
      ui: { setStatus: (_key: string, value: string | undefined) => firstStatuses.push(value) },
    } as any);
    initNotificationWidget({
      hasUI: true,
      ui: { setStatus: (_key: string, value: string | undefined) => secondStatuses.push(value) },
    } as any);

    const firstCountAfterReplace = firstStatuses.length;
    firstCleanup();
    assert.equal(firstStatuses.length, firstCountAfterReplace, "stale cleanup must not clear the replaced status chip");

    appendNotification("Need follow-up", "warning");

    assert.equal(
      firstStatuses.length,
      firstCountAfterReplace,
      "replaced widget must not receive store-change refreshes",
    );
    assert.match(secondStatuses.at(-1) ?? "", /2 unread/);
  } finally {
    _resetNotificationWidgetForTests();
    _resetNotificationStore();
    rmSync(tmp, { recursive: true, force: true });
  }
});
