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

  it("MONO-02: root package.json is the gsd-pi CLI package (not a workspace root)", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    // The repo root package.json is the published gsd-pi CLI — it is not a workspace
    // root, so it has no workspaces field. Mission-control lives in packages/ but is
    // managed independently via its own bun workspace.
    expect(pkg.name).toBe("gsd-pi");
    expect(pkg.bin).toBeDefined();
  });

  it("MONO-03: root package.json files field does NOT include mission-control (Tauri app should not ship in npm)", async () => {
    const pkg = await Bun.file(join(ROOT, "package.json")).json();
    expect(pkg.files).toBeDefined();
    // The bare "packages" entry would include mission-control (68MB Tauri app).
    // Each workspace package must be listed explicitly so mission-control is excluded.
    const includesMissionControl = pkg.files.some((f: string) =>
      f === "packages" || f.startsWith("packages/mission-control")
    );
    expect(includesMissionControl).toBe(false);
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
