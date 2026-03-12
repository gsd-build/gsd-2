import { describe, expect, it } from "bun:test";
import { join } from "path";

const ROOT = join(import.meta.dir, "..", "..", "..");
const MC_ROOT = join(import.meta.dir, "..");

describe("workspace structure", () => {
  it("MONO-01: mission-control package.json exists with correct name", async () => {
    const pkg = await Bun.file(join(MC_ROOT, "package.json")).json();
    expect(pkg.name).toBe("@gsd/mission-control");
    expect(pkg.private).toBe(true);
  });

  it("MONO-02: root package.json has workspaces field containing packages/*", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    expect(pkg.workspaces).toBeDefined();
    expect(pkg.workspaces).toContain("packages/*");
  });

  it("MONO-03: root package.json files field does NOT include packages entries", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    expect(pkg.files).toBeDefined();
    const hasPackages = pkg.files.some((f: string) =>
      f.startsWith("packages")
    );
    expect(hasPackages).toBe(false);
  });

  it("bunfig.toml exists in mission-control", async () => {
    const file = Bun.file(join(MC_ROOT, "bunfig.toml"));
    expect(await file.exists()).toBe(true);
  });

  it("tsconfig.json exists in mission-control", async () => {
    const file = Bun.file(join(MC_ROOT, "tsconfig.json"));
    expect(await file.exists()).toBe(true);
  });
});
