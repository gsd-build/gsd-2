/**
 * Session Status API — detect continue-here files for session resumption.
 * Returns the most recently found continue-here data or null.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import matter from "gray-matter";

interface ContinueHereData {
  phase: string;
  task: number;
  totalTasks: number;
  status: string;
  currentState: string | null;
  nextAction: string | null;
}

/**
 * Extract content between XML-style tags from markdown body.
 * Returns trimmed content or null if tag not found.
 */
function extractTagContent(body: string, tag: string): string | null {
  const pattern = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const match = body.match(pattern);
  return match ? match[1].trim() : null;
}

/**
 * Scan phases directory for any file containing "continue-here" in name.
 * Returns parsed data from the first found file, or null.
 */
async function findContinueHere(planningDir: string): Promise<ContinueHereData | null> {
  const phasesDir = join(planningDir, "phases");

  let phaseDirs: string[];
  try {
    phaseDirs = await readdir(phasesDir);
  } catch {
    // phases/ doesn't exist — no continue-here
    return null;
  }

  for (const dir of phaseDirs) {
    const phaseDir = join(phasesDir, dir);
    let files: string[];
    try {
      files = await readdir(phaseDir);
    } catch {
      continue;
    }

    const continueFile = files.find((f) => f.includes("continue-here"));
    if (!continueFile) continue;

    try {
      const raw = await readFile(join(phaseDir, continueFile), "utf-8");
      const { data, content } = matter(raw);

      return {
        phase: String(data.phase ?? ""),
        task: Number(data.task ?? 0),
        totalTasks: Number(data.total_tasks ?? 0),
        status: String(data.status ?? ""),
        currentState: extractTagContent(content, "current_state"),
        nextAction: extractTagContent(content, "next_action"),
      };
    } catch {
      // Malformed file — skip
      continue;
    }
  }

  return null;
}

/**
 * HTTP handler for GET /api/session/status.
 * Returns Response or null if route not matched.
 */
export async function handleSessionStatusRequest(
  req: Request,
  url: URL,
  planningDir: string
): Promise<Response | null> {
  const { pathname } = url;

  // Only handle GET /api/session/status
  if (pathname !== "/api/session/status") return null;
  if (req.method !== "GET") return null;

  const continueHere = await findContinueHere(planningDir);

  return Response.json({ continueHere });
}
