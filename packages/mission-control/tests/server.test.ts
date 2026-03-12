import { describe, expect, it, afterAll } from "bun:test";
import { join } from "path";

const MC_ROOT = join(import.meta.dir, "..");
let serverProc: ReturnType<typeof Bun.spawn> | null = null;

afterAll(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
});

describe("server", () => {
  it(
    "SERV-01: starts and responds with HTML on :4000",
    async () => {
      serverProc = Bun.spawn(["bun", "run", "src/server.ts"], {
        cwd: MC_ROOT,
        stdout: "pipe",
        stderr: "pipe",
      });

      // Wait for server to be ready (poll with short intervals)
      let ready = false;
      for (let i = 0; i < 20; i++) {
        try {
          const res = await fetch("http://localhost:4000");
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

      const response = await fetch("http://localhost:4000");
      expect(response.status).toBe(200);

      const contentType = response.headers.get("content-type") || "";
      expect(contentType).toContain("text/html");

      const body = await response.text();
      expect(body).toContain("root");
    },
    { timeout: 15000 }
  );
});
