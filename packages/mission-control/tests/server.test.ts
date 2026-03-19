import { describe, expect, it, afterAll } from "bun:test";
import { join } from "path";

const MC_ROOT = join(import.meta.dir, "..");
const TEST_PORT = 4219; // isolated port for tests — avoids conflict with dev server on :4200
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

afterAll(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

describe("server", () => {
  it(
    "SERV-01: starts and responds with HTML on :4219",
    async () => {
      serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
        cwd: MC_ROOT,
        env: { ...process.env, MC_PORT: String(TEST_PORT), MC_NO_HMR: "1" },
        stdout: "pipe",
        stderr: "pipe",
      });

      // Wait for server to be ready (poll for up to 25s — server may be slow under parallel test load)
      let ready = false;
      for (let i = 0; i < 50; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${TEST_PORT}`, {
            signal: AbortSignal.timeout(1000),
          });
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          // Server not ready yet
        }
        await Bun.sleep(250);
      }

      expect(ready).toBe(true);

      const response = await fetch(`http://127.0.0.1:${TEST_PORT}`);
      expect(response.status).toBe(200);

      const contentType = response.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");

      const body = await response.text();
      expect(body).toContain("root");
    },
    { timeout: 30000 }
  );
});
