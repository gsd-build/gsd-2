/**
 * Tests for PreviewPanel component tree (PREV-02, PREV-03, PREV-04).
 *
 * Pattern: Direct function call + JSON.stringify inspection,
 * matching the approach used in animations.test.tsx, discuss-review.test.tsx.
 *
 * Components tested:
 * - ViewportSwitcher: four buttons (Desktop/Tablet/Mobile/Dual)
 * - DeviceFrame: CSS frame shells for iPhone/Pixel in Dual mode
 * - PreviewPanel: pure render — slide animation, header, iframe, port input
 */
import { describe, test, expect } from "bun:test";
import { PreviewPanel } from "../src/components/preview/PreviewPanel";
import { ViewportSwitcher } from "../src/components/preview/ViewportSwitcher";
import { DeviceFrame, DEVICE_FRAMES } from "../src/components/preview/DeviceFrame";

// -- ViewportSwitcher --

describe("ViewportSwitcher", () => {
  test("renders Desktop viewport button", () => {
    const html = JSON.stringify(ViewportSwitcher({
      viewport: "desktop",
      onViewportChange: () => {},
    }));
    expect(html).toContain("Desktop");
  });

  test("renders Tablet viewport button", () => {
    const html = JSON.stringify(ViewportSwitcher({
      viewport: "desktop",
      onViewportChange: () => {},
    }));
    expect(html).toContain("Tablet");
  });

  test("renders Mobile viewport button", () => {
    const html = JSON.stringify(ViewportSwitcher({
      viewport: "desktop",
      onViewportChange: () => {},
    }));
    expect(html).toContain("Mobile");
  });

  test("renders Dual viewport button", () => {
    const html = JSON.stringify(ViewportSwitcher({
      viewport: "desktop",
      onViewportChange: () => {},
    }));
    expect(html).toContain("Dual");
  });

  test("active Desktop button has different styling when viewport is desktop", () => {
    const activeHtml = JSON.stringify(ViewportSwitcher({
      viewport: "desktop",
      onViewportChange: () => {},
    }));
    const inactiveHtml = JSON.stringify(ViewportSwitcher({
      viewport: "tablet",
      onViewportChange: () => {},
    }));
    // They should differ (active state class changes)
    expect(activeHtml).not.toBe(inactiveHtml);
  });
});

// -- DeviceFrame --

describe("DeviceFrame", () => {
  test("DEVICE_FRAMES contains iphone and pixel entries", () => {
    expect(DEVICE_FRAMES.iphone).toBeDefined();
    expect(DEVICE_FRAMES.pixel).toBeDefined();
  });

  test("DEVICE_FRAMES iphone has correct dimensions", () => {
    expect(DEVICE_FRAMES.iphone.width).toBe(390);
    expect(DEVICE_FRAMES.iphone.height).toBe(750);
    expect(DEVICE_FRAMES.iphone.radius).toBe(47);
    expect(DEVICE_FRAMES.iphone.label).toBe("iPhone 14");
  });

  test("DEVICE_FRAMES pixel has correct dimensions", () => {
    expect(DEVICE_FRAMES.pixel.width).toBe(412);
    expect(DEVICE_FRAMES.pixel.height).toBe(750);
    expect(DEVICE_FRAMES.pixel.radius).toBe(17);
    expect(DEVICE_FRAMES.pixel.label).toBe("Pixel 7");
  });

  test("DeviceFrame renders iframe inside", () => {
    const html = JSON.stringify(DeviceFrame({
      device: "iphone",
      src: "/api/preview/",
      iframeId: "preview-iframe-iphone",
    }));
    expect(html).toContain("iframe");
  });

  test("DeviceFrame iphone renders with id preview-iframe-iphone", () => {
    const html = JSON.stringify(DeviceFrame({
      device: "iphone",
      src: "/api/preview/",
      iframeId: "preview-iframe-iphone",
    }));
    expect(html).toContain("preview-iframe-iphone");
  });

  test("DeviceFrame pixel renders with id preview-iframe-pixel", () => {
    const html = JSON.stringify(DeviceFrame({
      device: "pixel",
      src: "/api/preview/",
      iframeId: "preview-iframe-pixel",
    }));
    expect(html).toContain("preview-iframe-pixel");
  });
});

// -- PreviewPanel --

describe("PreviewPanel animation", () => {
  test("panel root has animate-in slide-in-from-right duration-200 classes", () => {
    const html = JSON.stringify(PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("animate-in");
    expect(html).toContain("slide-in-from-right");
    expect(html).toContain("duration-200");
  });
});

describe("PreviewPanel header", () => {
  test("renders Live Preview title", () => {
    const html = JSON.stringify(PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("Live Preview");
  });

  test("renders port input with placeholder 'port' when port is null", () => {
    const html = JSON.stringify(PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("port");
    expect(html).toContain("number");
  });

  test("renders port input pre-filled with current port value", () => {
    const html = JSON.stringify(PreviewPanel({
      port: 3000,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("3000");
  });
});

describe("PreviewPanel viewport modes", () => {
  test("in non-Dual mode renders single iframe with /api/preview/ src when port is set", () => {
    const html = JSON.stringify(PreviewPanel({
      port: 3000,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("iframe");
    expect(html).toContain("/api/preview/");
  });

  test("in Dual mode renders iframe with id preview-iframe-iphone", () => {
    const html = JSON.stringify(PreviewPanel({
      port: 3000,
      viewport: "dual",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("preview-iframe-iphone");
  });

  test("in Dual mode renders iframe with id preview-iframe-pixel", () => {
    const html = JSON.stringify(PreviewPanel({
      port: 3000,
      viewport: "dual",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    expect(html).toContain("preview-iframe-pixel");
  });
});

describe("PreviewPanel native app empty state", () => {
  test("renders no web preview message when isNativeApp=true", () => {
    const html = JSON.stringify(PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
      isNativeApp: true,
    }));
    expect(html).toContain("No web preview available for native apps");
  });
});

describe("PreviewPanel callbacks wiring", () => {
  test("close button is present via aria-label in rendered output", () => {
    const html = JSON.stringify(PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    }));
    // Close button has aria-label="Close preview"
    expect(html).toContain("Close preview");
  });

  test("ViewportSwitcher is rendered with viewport prop in tree", () => {
    const result = PreviewPanel({
      port: null,
      viewport: "desktop",
      onClose: () => {},
      onPortChange: () => {},
      onViewportChange: () => {},
    });
    // ViewportSwitcher is a child component — check it appears in serialized tree
    const html = JSON.stringify(result);
    // ViewportSwitcher renders with props.viewport in the tree
    expect(html).toContain('"viewport":"desktop"');
  });
});

// -- PreviewPanelWithState exports --

describe("PreviewPanelWithState exports", () => {
  test("PreviewPanelWithState is exported from the wrapper file", async () => {
    const mod = await import("../src/components/preview/PreviewPanelWithState");
    expect(typeof mod.PreviewPanelWithState).toBe("function");
  });
});
