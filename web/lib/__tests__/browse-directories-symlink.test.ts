import { describe, test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, symlinkSync, rmSync, writeFileSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Build a fake HOME with a .gsd/web-preferences.json pointing devRoot at a
// scoped directory, then place a symlink inside that directory that escapes
// to a sibling. The route must reject the symlinked path with 403 even though
// the lexical path lies inside devRoot.

const sandbox = mkdtempSync(join(tmpdir(), "gsd-symlink-test-"));
const fakeHome = join(sandbox, "home");
const devRoot = join(fakeHome, "dev");
const escapeTarget = join(sandbox, "escape");
const symlinkInside = join(devRoot, "trap");
const realInside = join(devRoot, "ok");

mkdirSync(devRoot, { recursive: true });
mkdirSync(escapeTarget, { recursive: true });
mkdirSync(realInside, { recursive: true });
mkdirSync(join(fakeHome, ".gsd"), { recursive: true });
writeFileSync(
  join(fakeHome, ".gsd", "web-preferences.json"),
  JSON.stringify({ devRoot }),
  "utf-8",
);
symlinkSync(escapeTarget, symlinkInside, "dir");

const prevHome = process.env.HOME;
const prevUserprofile = process.env.USERPROFILE;
process.env.HOME = fakeHome;
process.env.USERPROFILE = fakeHome;

const { GET } = await import("../../app/api/browse-directories/route.ts");

describe("GET /api/browse-directories — symlink escape", () => {
  before(() => {
    // sandbox already set up at module load.
  });

  after(() => {
    if (prevHome === undefined) delete process.env.HOME;
    else process.env.HOME = prevHome;
    if (prevUserprofile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUserprofile;
    rmSync(sandbox, { recursive: true, force: true });
  });

  test("rejects an in-scope symlink that points outside the allowed roots", async () => {
    const res = await GET(
      new Request(`http://x/api/browse-directories?path=${encodeURIComponent(symlinkInside)}`),
    );
    assert.equal(res.status, 403, `expected 403, got ${res.status} body=${await res.text()}`);
  });

  test("allows a real directory inside devRoot", async () => {
    const res = await GET(
      new Request(`http://x/api/browse-directories?path=${encodeURIComponent(realInside)}`),
    );
    assert.equal(res.status, 200);
    const body = (await res.json()) as { current: string };
    assert.equal(body.current, realpathSync(realInside));
  });
});
