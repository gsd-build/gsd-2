/**
 * Native OS folder dialog API.
 * Spawns platform-appropriate dialog (PowerShell on Windows, zenity on Linux).
 * Follows route dispatcher pattern from fs-api.ts.
 */

import { spawn as nodeSpawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";

/** Injectable spawn function for testing. */
let spawnFn: typeof nodeSpawn = nodeSpawn;

/** Test-only: override spawn function. */
export function _setSpawnFn(fn: any): void {
  spawnFn = fn;
}

/**
 * Spawn a native OS folder dialog and return the selected path.
 * Returns the trimmed stdout on success, empty string on cancel/error.
 */
function openFolderDialog(): Promise<{ path: string; exitCode: number }> {
  return new Promise((resolve) => {
    let proc: ChildProcess;

    if (process.platform === "win32") {
      proc = spawnFn("powershell", [
        "-NoProfile",
        "-sta",
        "-Command",
        `Add-Type -AssemblyName System.Windows.Forms; $dlg = New-Object System.Windows.Forms.FolderBrowserDialog; $dlg.Description = 'Select Project Folder'; $dlg.ShowNewFolderButton = $true; if ($dlg.ShowDialog() -eq 'OK') { $dlg.SelectedPath } else { '' }`,
      ], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
    } else {
      proc = spawnFn("zenity", [
        "--file-selection",
        "--directory",
        "--title=Select Project Folder",
      ], {
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
    }

    let stdout = "";

    proc.stdout!.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    proc.on("close", (code) => {
      resolve({ path: stdout.trim(), exitCode: code ?? 1 });
    });

    proc.on("error", (err) => {
      console.error("[dialog-api] Spawn error:", err.message);
      resolve({ path: "", exitCode: 1 });
    });
  });
}

/**
 * HTTP request handler for /api/dialog/* routes.
 * Returns Response or null if route not matched.
 */
export async function handleDialogRequest(
  req: Request,
  url: URL
): Promise<Response | null> {
  const { pathname } = url;

  // POST /api/dialog/open-folder
  if (pathname === "/api/dialog/open-folder" && req.method === "POST") {
    const result = await openFolderDialog();

    if (!result.path || result.exitCode !== 0) {
      return Response.json({ cancelled: true });
    }

    // Normalize backslashes to forward slashes
    const normalizedPath = result.path.replace(/\\/g, "/");
    return Response.json({ path: normalizedPath });
  }

  return null;
}
