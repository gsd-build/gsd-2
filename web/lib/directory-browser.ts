import { dirname, relative, resolve, sep } from "node:path"

export interface BrowseEntry {
  name: string
  path: string
}

export interface BrowseDirectoryResult {
  current: string
  parent: string | null
  entries: BrowseEntry[]
  shortcuts: BrowseEntry[]
}

export function pathDisplayName(path: string): string {
  const normalized = path.replace(/\/+$/, "")
  if (!normalized) return "Filesystem Root"
  return normalized.split("/").pop() || normalized || path
}

export function createRootShortcuts(paths: string[]): BrowseEntry[] {
  const seen = new Set<string>()
  return paths.flatMap((path) => {
    if (seen.has(path)) return []
    seen.add(path)
    return [{
      name: pathDisplayName(path),
      path,
    }]
  })
}

function isSameOrDescendant(candidate: string, root: string): boolean {
  const resolvedCandidate = resolve(candidate)
  const resolvedRoot = resolve(root)
  if (resolvedCandidate === resolvedRoot) return true
  const pathToCandidate = relative(resolvedRoot, resolvedCandidate)
  return (
    Boolean(pathToCandidate) &&
    !pathToCandidate.startsWith("..") &&
    pathToCandidate !== ".." &&
    !pathToCandidate.startsWith(sep)
  )
}

export function isAllowedBrowsePath(candidate: string, devRoot: string, browseRoots: string[]): boolean {
  const devRootParent = dirname(devRoot)
  const filesystemRoot = resolve("/")
  const resolvedCandidate = resolve(candidate)
  const authRoots = browseRoots.filter((root) => resolve(root) !== filesystemRoot)
  return (
    resolvedCandidate === filesystemRoot ||
    isSameOrDescendant(candidate, devRoot) ||
    candidate === devRootParent ||
    authRoots.some((root) => isSameOrDescendant(candidate, root))
  )
}
