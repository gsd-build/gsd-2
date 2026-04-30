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
