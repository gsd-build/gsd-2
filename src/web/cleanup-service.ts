import { resolveBridgeRuntimeConfig } from "./bridge-service.ts"
import { resolveSubprocessModule } from "./subprocess-module-resolver.ts"
import { runSubprocess } from "./subprocess-runner.ts"
import type { CleanupData, CleanupResult } from "../../web/lib/remaining-command-types.ts"

const CLEANUP_MAX_BUFFER = 2 * 1024 * 1024
const CLEANUP_TIMEOUT_MS = 20_000
const CLEANUP_MODULE_ENV = "GSD_CLEANUP_MODULE"



/**
 * Collects cleanup data (GSD branches and snapshot refs) via a child process.
 * Child-process pattern required because native-git-bridge.ts uses .ts imports
 * that need the resolve-ts.mjs loader.
 */
export async function collectCleanupData(projectCwdOverride?: string): Promise<CleanupData> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "native-git-bridge.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${CLEANUP_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_CLEANUP_BASE;',
    // Get all GSD branches
    'let branches = [];',
    'try { branches = mod.nativeBranchList(basePath, "gsd/*"); } catch {}',
    // Detect main branch and find which GSD branches are merged
    'let mainBranch = "main";',
    'try { mainBranch = mod.nativeDetectMainBranch(basePath); } catch {}',
    'let merged = [];',
    'try { merged = mod.nativeBranchListMerged(basePath, mainBranch, "gsd/*"); } catch {}',
    'const mergedSet = new Set(merged);',
    'const branchList = branches.map(b => ({ name: b, merged: mergedSet.has(b) }));',
    // Get snapshot refs
    'let refs = [];',
    'try { refs = mod.nativeForEachRef(basePath, "refs/gsd/snapshots/"); } catch {}',
    'const snapshotList = refs.map(r => {',
    '  const parts = r.split(" ");',
    '  return { ref: parts[0] || r, date: parts.length > 1 ? parts.slice(1).join(" ") : "" };',
    '});',
    'process.stdout.write(JSON.stringify({ branches: branchList, snapshots: snapshotList }));',
  ].join(" ")

  return runSubprocess<CleanupData>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [CLEANUP_MODULE_ENV]: resolved.modulePath,
        GSD_CLEANUP_BASE: projectCwd,
      },
      maxBuffer: CLEANUP_MAX_BUFFER,
      timeout: CLEANUP_TIMEOUT_MS,
    },
    "cleanup data",
  )
}

/**
 * Executes cleanup operations (branch deletion and snapshot pruning) via a child process.
 * Child-process pattern required because nativeBranchDelete and nativeUpdateRef
 * modify git state using .ts imports.
 */
export async function executeCleanup(
  deleteBranches: string[],
  pruneSnapshots: string[],
  projectCwdOverride?: string,
): Promise<CleanupResult> {
  const config = resolveBridgeRuntimeConfig(undefined, projectCwdOverride)
  const { packageRoot, projectCwd } = config
  const resolved = resolveSubprocessModule(packageRoot, "native-git-bridge.ts")

  const script = [
    'const { pathToFileURL } = await import("node:url");',
    `const mod = await import(pathToFileURL(process.env.${CLEANUP_MODULE_ENV}).href);`,
    'const basePath = process.env.GSD_CLEANUP_BASE;',
    'const branches = JSON.parse(process.env.GSD_CLEANUP_BRANCHES || "[]");',
    'const snapshots = JSON.parse(process.env.GSD_CLEANUP_SNAPSHOTS || "[]");',
    'let deletedBranches = 0;',
    'let prunedSnapshots = 0;',
    'const errors = [];',
    'for (const branch of branches) {',
    '  try { mod.nativeBranchDelete(basePath, branch, true); deletedBranches++; }',
    '  catch (e) { errors.push(`Branch ${branch}: ${e.message}`); }',
    '}',
    'for (const ref of snapshots) {',
    '  try { mod.nativeUpdateRef(basePath, ref); prunedSnapshots++; }',
    '  catch (e) { errors.push(`Ref ${ref}: ${e.message}`); }',
    '}',
    'const parts = [];',
    'if (deletedBranches > 0) parts.push(`Deleted ${deletedBranches} branch(es)`);',
    'if (prunedSnapshots > 0) parts.push(`Pruned ${prunedSnapshots} snapshot(s)`);',
    'if (errors.length > 0) parts.push(`Errors: ${errors.join("; ")}`);',
    'const message = parts.length > 0 ? parts.join(". ") : "No items to clean up";',
    'process.stdout.write(JSON.stringify({ deletedBranches, prunedSnapshots, message }));',
  ].join(" ")

  return runSubprocess<CleanupResult>(
    process.execPath,
    [...resolved.nodeArgs, script],
    {
      cwd: packageRoot,
      env: {
        ...process.env,
        [CLEANUP_MODULE_ENV]: resolved.modulePath,
        GSD_CLEANUP_BASE: projectCwd,
        GSD_CLEANUP_BRANCHES: JSON.stringify(deleteBranches),
        GSD_CLEANUP_SNAPSHOTS: JSON.stringify(pruneSnapshots),
      },
      maxBuffer: CLEANUP_MAX_BUFFER,
      timeout: CLEANUP_TIMEOUT_MS,
    },
    "cleanup",
  )
}
