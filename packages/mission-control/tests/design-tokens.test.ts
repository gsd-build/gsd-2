import { describe, expect, it } from "bun:test";
import { COLORS, TYPOGRAPHY, SPACING, PANEL_DEFAULTS } from "../src/styles/design-tokens";

describe("design tokens", () => {
  describe("PANEL_DEFAULTS", () => {
    it("values sum to 100", () => {
      const sum = Object.values(PANEL_DEFAULTS).reduce((a, b) => a + b, 0);
      expect(sum).toBe(100);
    });

    it("sidebar equals 14", () => {
      expect(PANEL_DEFAULTS.sidebar).toBe(14);
    });

    it("milestone equals 22", () => {
      expect(PANEL_DEFAULTS.milestone).toBe(22);
    });

    it("sliceDetail equals 19", () => {
      expect(PANEL_DEFAULTS.sliceDetail).toBe(19);
    });

    it("activeTask equals 21", () => {
      expect(PANEL_DEFAULTS.activeTask).toBe(21);
    });

    it("chat equals 24", () => {
      expect(PANEL_DEFAULTS.chat).toBe(24);
    });
  });

  describe("COLORS", () => {
    it("navy.base equals #0F1419", () => {
      expect(COLORS.navy.base).toBe("#0F1419");
    });

    it("cyan.accent equals #5BC8F0", () => {
      expect(COLORS.cyan.accent).toBe("#5BC8F0");
    });
  });

  describe("TYPOGRAPHY", () => {
    it("has fontDisplay property", () => {
      expect(TYPOGRAPHY.fontDisplay).toBeDefined();
      expect(typeof TYPOGRAPHY.fontDisplay).toBe("string");
    });

    it("has fontMono property", () => {
      expect(TYPOGRAPHY.fontMono).toBeDefined();
      expect(typeof TYPOGRAPHY.fontMono).toBe("string");
    });

    it("sizes has exactly 4 entries (xs, sm, base, lg)", () => {
      const keys = Object.keys(TYPOGRAPHY.sizes);
      expect(keys).toEqual(["xs", "sm", "base", "lg"]);
      expect(keys.length).toBe(4);
    });
  });

  describe("SPACING", () => {
    it("all values are multiples of 4px", () => {
      for (const [key, value] of Object.entries(SPACING)) {
        const num = parseInt(value, 10);
        expect(num % 4).toBe(0);
      }
    });
  });
});
