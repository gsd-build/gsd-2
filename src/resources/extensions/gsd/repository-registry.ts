// GSD-2 + Repository registry seam for parent workspace multi-repo resolution.

import { isAbsolute, relative, resolve } from "node:path";
import type { GSDPreferences, WorkspacePreferences, WorkspaceRepositoryPreference } from "./preferences-types.js";
import { resolveGsdPathContract } from "./paths.js";

export interface RegisteredRepository {
  id: string;
  root: string;
  role?: string;
  verification?: string[];
  commitPolicy?: "auto" | "skip";
}

export interface RepositoryRegistry {
  projectRoot: string;
  mode: "project" | "parent";
  repositories: RegisteredRepository[];
  byId: ReadonlyMap<string, RegisteredRepository>;
}

function assertInsideProjectRoot(projectRoot: string, candidateRoot: string, repoId: string): void {
  const rel = relative(projectRoot, candidateRoot);
  if (rel === "") return;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`workspace.repositories.${repoId}.path resolves outside project root: ${candidateRoot}`);
  }
}

function resolveRepositoryRoot(
  projectRoot: string,
  repoId: string,
  repo: WorkspaceRepositoryPreference,
): RegisteredRepository {
  const root = resolve(projectRoot, repo.path);
  assertInsideProjectRoot(projectRoot, root, repoId);
  return {
    id: repoId,
    root,
    role: repo.role,
    verification: repo.verification,
    commitPolicy: repo.commit_policy,
  };
}

export function createRepositoryRegistry(
  basePath: string,
  workspacePrefs?: WorkspacePreferences,
): RepositoryRegistry {
  const contract = resolveGsdPathContract(basePath);
  const projectRoot = contract.projectRoot;
  const mode = workspacePrefs?.mode ?? "project";
  const repoMap = new Map<string, RegisteredRepository>();

  // Backward-compatible default for single-repo projects.
  // Explicit workspacePrefs?.repositories entries can override "project"
  // via resolveRepositoryRoot to customize role/verification/commit policy.
  repoMap.set("project", { id: "project", root: projectRoot });

  for (const [repoId, repoConfig] of Object.entries(workspacePrefs?.repositories ?? {})) {
    repoMap.set(repoId, resolveRepositoryRoot(projectRoot, repoId, repoConfig));
  }

  return {
    projectRoot,
    mode,
    repositories: Array.from(repoMap.values()),
    byId: repoMap,
  };
}

export function createRepositoryRegistryFromPreferences(
  basePath: string,
  preferences?: Pick<GSDPreferences, "workspace">,
): RepositoryRegistry {
  return createRepositoryRegistry(basePath, preferences?.workspace);
}
