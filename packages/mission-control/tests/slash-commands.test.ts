/**
 * COMPAT-04: GSD 2 command registry
 *
 * RED state: These tests fail until Plan 12-02 updates GSD_COMMANDS to GSD 2 syntax.
 * Currently GSD_COMMANDS has 22 v1 "/gsd:" entries. After COMPAT-04 it must have
 * exactly 9 GSD 2 entries with space syntax (/gsd, /gsd auto, ...).
 */
import { describe, it, expect } from "bun:test";
import { GSD_COMMANDS } from "../src/lib/slash-commands";

const GSD2_COMMANDS = [
  "/gsd",
  "/gsd auto",
  "/gsd stop",
  "/gsd discuss",
  "/gsd status",
  "/gsd queue",
  "/gsd prefs",
  "/gsd migrate",
  "/gsd doctor",
];

describe("COMPAT-04: GSD 2 command registry", () => {
  it("GSD_COMMANDS has exactly 9 entries (GSD 2 registry)", () => {
    // Currently fails: GSD_COMMANDS has 22 v1 entries
    expect(GSD_COMMANDS).toHaveLength(9);
  });

  it("GSD_COMMANDS contains all 9 GSD 2 commands", () => {
    const commands = GSD_COMMANDS.map((c) => c.command);
    for (const cmd of GSD2_COMMANDS) {
      expect(commands).toContain(cmd);
    }
  });

  it("GSD_COMMANDS contains NO v1 colon-syntax entries (no /gsd: prefix)", () => {
    // Currently fails: all 22 entries use /gsd: prefix
    const colonEntries = GSD_COMMANDS.filter((c) => c.command.startsWith("/gsd:"));
    expect(colonEntries).toHaveLength(0);
  });

  it("every entry has source: 'gsd'", () => {
    for (const cmd of GSD_COMMANDS) {
      expect(cmd.source).toBe("gsd");
    }
  });

  it("/gsd entry has correct description (guided mode)", () => {
    const gsd = GSD_COMMANDS.find((c) => c.command === "/gsd");
    expect(gsd).toBeDefined();
    expect(gsd!.description).toBeTruthy();
  });

  it("/gsd auto entry exists", () => {
    const auto = GSD_COMMANDS.find((c) => c.command === "/gsd auto");
    expect(auto).toBeDefined();
  });

  it("/gsd migrate entry exists", () => {
    const migrate = GSD_COMMANDS.find((c) => c.command === "/gsd migrate");
    expect(migrate).toBeDefined();
  });

  it("/gsd doctor entry exists", () => {
    const doctor = GSD_COMMANDS.find((c) => c.command === "/gsd doctor");
    expect(doctor).toBeDefined();
  });
});
