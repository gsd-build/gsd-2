/**
 * UAT Results API — writes S{N}-UAT-RESULTS.md to the .gsd directory.
 *
 * Called from server.ts route: POST /api/uat-results
 * Body: { sliceId: string, items: GSD2UatItem[] }
 */
import { join } from "node:path";
import type { GSD2UatItem } from "./types";

/**
 * Write UAT checklist results to {gsdDir}/{sliceId}-UAT-RESULTS.md.
 * Format:
 *   # UAT Results: S03
 *   Generated: <ISO timestamp>
 *   ## Checklist
 *   - [x] UAT-01: description
 *   - [ ] UAT-02: description
 */
export async function writeUatResults(
  gsdDir: string,
  sliceId: string,
  items: GSD2UatItem[]
): Promise<void> {
  const timestamp = new Date().toISOString();
  const checklistLines = items.map((item) => {
    const mark = item.checked ? "[x]" : "[ ]";
    return `- ${mark} ${item.id}: ${item.text}`;
  });

  const content = [
    `# UAT Results: ${sliceId}`,
    "",
    `Generated: ${timestamp}`,
    "",
    "## Checklist",
    "",
    ...checklistLines,
    "",
  ].join("\n");

  const filePath = join(gsdDir, `${sliceId}-UAT-RESULTS.md`);
  await Bun.write(filePath, content);
}

/**
 * HTTP request handler for POST /api/uat-results.
 * Returns Response or null if route not matched.
 */
export async function handleUatResultsRequest(
  req: Request,
  url: URL,
  gsdDir: string
): Promise<Response | null> {
  if (url.pathname === "/api/uat-results" && req.method === "POST") {
    let body: { sliceId?: string; items?: GSD2UatItem[] };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { sliceId, items } = body;
    if (!sliceId || !Array.isArray(items)) {
      return Response.json(
        { error: "Body must include sliceId (string) and items (array)" },
        { status: 400 }
      );
    }

    try {
      await writeUatResults(gsdDir, sliceId, items);
      return Response.json({ ok: true });
    } catch (err) {
      return Response.json(
        { error: err instanceof Error ? err.message : "Write failed" },
        { status: 500 }
      );
    }
  }

  return null;
}
