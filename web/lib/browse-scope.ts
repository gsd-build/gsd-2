import { resolve, dirname, sep } from "node:path";

export interface BrowseScopeOptions {
  /** Configured devRoot (already resolved to an absolute path). */
  devRoot: string;
  /** Absolute path to the user's home directory. */
  home: string;
  /** Additional allowed roots (e.g. `/Volumes` on macOS, `/media` on Linux). */
  additionalRoots: string[];
}

/**
 * Return true if `target` is inside any of the allowed scope roots.
 *
 * Allowed roots are:
 *   1. devRoot and all of its descendants
 *   2. the direct parent of devRoot (one level up, for navigation context)
 *   3. the user's home directory and all of its descendants
 *   4. each entry of `additionalRoots` and its descendants
 *
 * The check uses path-aware matching (boundary-aware), so `/Users/alice-evil`
 * is NOT treated as a child of `/Users/alice`.
 */
export function isAllowedBrowsePath(target: string, opts: BrowseScopeOptions): boolean {
  const t = resolve(target);
  const devRoot = resolve(opts.devRoot);
  const roots = [devRoot, resolve(opts.home), ...opts.additionalRoots.map((r) => resolve(r))];
  for (const root of roots) {
    if (isWithin(t, root)) return true;
  }
  // Allow the immediate parent of devRoot so the picker can show devRoot's siblings.
  if (t === dirname(devRoot)) return true;
  return false;
}

/** Path-aware "is `child` equal to or inside `parent`" check. */
function isWithin(child: string, parent: string): boolean {
  if (child === parent) return true;
  const withSep = parent.endsWith(sep) ? parent : parent + sep;
  return child.startsWith(withSep);
}

/**
 * Return additional allowed roots beyond `devRoot` and `$HOME`, based on platform.
 * `exists` is injected so the function stays pure and testable. `username` is
 * used on Linux to scope `/run/media/<user>` to the current user rather than
 * exposing all users' mounted media.
 *
 *  - darwin: `/Volumes`
 *  - linux:  `/media`, `/mnt` (and `/run/media/<username>` when a username is given)
 *  - win32:  every drive letter `A:\`..`Z:\` whose root currently exists
 */
export function getAdditionalRoots(
  platform: NodeJS.Platform | string,
  exists: (path: string) => boolean,
  username?: string,
): string[] {
  if (platform === "win32") {
    const drives: string[] = [];
    for (let code = 65; code <= 90; code++) {
      drives.push(`${String.fromCharCode(code)}:\\`);
    }
    return drives.filter((d) => exists(d));
  }
  const candidates: string[] =
    platform === "darwin"
      ? ["/Volumes"]
      : platform === "linux"
        ? ["/media", "/mnt", username ? `/run/media/${username}` : ""].filter(Boolean)
        : [];
  return candidates.filter((p) => exists(p));
}
