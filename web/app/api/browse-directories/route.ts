import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { homedir, platform, userInfo } from "node:os";
import { isAllowedBrowsePath, getAdditionalRoots } from "../../../lib/browse-scope.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolve the configured dev root from web preferences.
 * Returns the devRoot path if set, otherwise the user's home directory.
 */
function currentUsername(): string | undefined {
  try {
    return userInfo().username || undefined;
  } catch {
    return undefined;
  }
}

/** Resolve symlinks if the path exists; otherwise fall back to a lexical resolve. */
function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return resolve(p);
  }
}

function getDevRoot(): string {
  try {
    const prefsPath = join(homedir(), ".gsd", "web-preferences.json");
    if (existsSync(prefsPath)) {
      const prefs = JSON.parse(readFileSync(prefsPath, "utf-8")) as Record<string, unknown>;
      if (typeof prefs.devRoot === "string" && prefs.devRoot) {
        return resolve(prefs.devRoot);
      }
    }
  } catch {
    // Fall through to default
  }
  return homedir();
}

/**
 * GET /api/browse-directories?path=/some/path
 *
 * Returns the directory listing for the given path.
 * Defaults to the configured devRoot (or home directory) if no path is given.
 * Only returns directories (no files) for the folder picker use case.
 *
 * Scope:
 *   - devRoot and its descendants
 *   - the immediate parent of devRoot (one level up for context)
 *   - the user's home directory and its descendants
 *   - platform-specific mount roots (e.g. /Volumes on macOS, /media on Linux,
 *     existing drive letters on Windows)
 */
export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const rawPath = url.searchParams.get("path");
    const devRoot = getDevRoot();
    const home = homedir();
    const additionalRoots = getAdditionalRoots(platform(), existsSync, currentUsername());
    const targetPath = rawPath ? resolve(rawPath) : devRoot;

    if (!existsSync(targetPath)) {
      return Response.json(
        { error: `Path does not exist: ${targetPath}` },
        { status: 404 },
      );
    }

    // Resolve symlinks before enforcing scope so an in-scope symlink that
    // points outside the allowed roots cannot escape the picker. Compare
    // canonical-against-canonical for both target and roots.
    const canonical = safeRealpath(targetPath);
    const canonicalOpts = {
      devRoot: safeRealpath(devRoot),
      home: safeRealpath(home),
      additionalRoots: additionalRoots.map(safeRealpath),
    };
    if (!isAllowedBrowsePath(canonical, canonicalOpts)) {
      return Response.json(
        { error: "Path outside allowed scope" },
        { status: 403 },
      );
    }

    const stat = statSync(canonical);
    if (!stat.isDirectory()) {
      return Response.json(
        { error: `Not a directory: ${canonical}` },
        { status: 400 },
      );
    }

    const parentPath = dirname(canonical);
    const parentAllowed =
      parentPath !== canonical &&
      isAllowedBrowsePath(parentPath, canonicalOpts);

    // Surface mount roots / drive letters as quick-access when browsing $HOME or devRoot.
    const showAdditionalRoots =
      additionalRoots.length > 0 && (canonical === canonicalOpts.home || canonical === canonicalOpts.devRoot);

    const entries: Array<{ name: string; path: string }> = [];

    try {
      const items = readdirSync(canonical, { withFileTypes: true });
      for (const item of items) {
        if (!item.isDirectory()) continue;
        if (item.name.startsWith(".")) continue;
        if (item.name === "node_modules") continue;

        entries.push({
          name: item.name,
          path: resolve(canonical, item.name),
        });
      }

      if (showAdditionalRoots) {
        for (const mp of additionalRoots) {
          const mpName = mp.split(/[/\\]/).filter(Boolean).pop() || mp;
          entries.push({
            name: mpName,
            path: mp,
          });
        }
      }
    } catch {
      // Permission denied or other read error — return empty entries
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({
      current: canonical,
      parent: parentAllowed ? parentPath : null,
      entries,
    });
  } catch (err) {
    return Response.json(
      { error: `Browse failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }
}
