import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { webPreferencesPath } from "../../../../src/app-paths.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Shape of persisted web preferences. */
interface WebPreferences {
  devRoot?: string;
  lastActiveProject?: string;
}

interface WebPreferencesResponse extends WebPreferences {
  launchCwd: string | null;
}

function readLaunchCwd(): string | null {
  const v = process.env.GSD_WEB_PROJECT_CWD;
  if (typeof v !== "string" || v.length === 0) return null;
  // Normalize so the value matches the resolved path the client compares against.
  return resolve(v);
}

// ─── GET: read current preferences ─────────────────────────────────────────

export async function GET(): Promise<Response> {
  const launchCwd = readLaunchCwd();
  try {
    if (!existsSync(webPreferencesPath)) {
      const body: WebPreferencesResponse = { launchCwd };
      return Response.json(body);
    }
    const raw = readFileSync(webPreferencesPath, "utf-8");
    const prefs: WebPreferences = JSON.parse(raw);
    const body: WebPreferencesResponse = { ...prefs, launchCwd };
    return Response.json(body);
  } catch {
    // File corrupt or unreadable — return empty (but still surface launchCwd)
    const body: WebPreferencesResponse = { launchCwd };
    return Response.json(body);
  }
}

// ─── PUT: write preferences ────────────────────────────────────────────────

export async function PUT(request: Request): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;

    // Read existing prefs to merge (don't clobber fields not in this request)
    let existing: WebPreferences = {};
    try {
      if (existsSync(webPreferencesPath)) {
        existing = JSON.parse(readFileSync(webPreferencesPath, "utf-8"));
      }
    } catch {
      // Corrupt file — start fresh
    }

    // Merge only provided keys
    const prefs: WebPreferences = { ...existing };
    if (typeof body.devRoot === "string") {
      prefs.devRoot = body.devRoot;
    }
    if (typeof body.lastActiveProject === "string") {
      prefs.lastActiveProject = body.lastActiveProject;
    }

    // Ensure parent directory exists
    const dir = dirname(webPreferencesPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    writeFileSync(webPreferencesPath, JSON.stringify(prefs, null, 2), "utf-8");
    return Response.json(prefs);
  } catch (err) {
    return Response.json(
      { error: `Failed to write preferences: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
