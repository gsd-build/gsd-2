---
estimated_steps: 4
estimated_files: 4
---

# T03: Add .gsd/ files API, wire FilesView, and write contract test

**Slice:** S04 — Current-project state surfaces
**Milestone:** M001

## Description

FilesView is the only view that needs a new server endpoint — the other views derive from the boot payload and SSE events. This task adds a GET `/api/files` route scoped to `.gsd/` within the project cwd, wires FilesView to fetch from it, and writes the slice-level contract test proving the data plumbing is correct and all mock data is removed.

## Steps

1. Create `web/app/api/files/route.ts` with a GET handler. Two modes: (a) no `path` query param → return `{ tree: FileNode[] }` listing the `.gsd/` directory recursively (directories and files, names and types). (b) `path` query param → return `{ content: string }` with the file's text content. Security: resolve the requested path against `<projectCwd>/.gsd/`, reject any path containing `..`, starting with `/`, or resolving outside `.gsd/`. Use `GSD_WEB_PROJECT_CWD` env var (same as bridge-service) for the project root. Limit file reads to a reasonable size (e.g. 256KB). Return 400 for invalid paths, 404 for missing files.
2. Rewrite `files-view.tsx` to fetch from `/api/files` on mount and fetch file content on selection. Replace the hardcoded `gsdFiles` constant with state populated from the API. Build the tree from the API response. Show loading state while fetching. Show empty state when `.gsd/` has no files. Handle fetch errors gracefully. Preserve the file-tree sidebar + content preview layout per D002.
3. Write `src/tests/web-state-surfaces-contract.test.ts` covering: (a) workspace index — `indexWorkspace` on a temp directory with a roadmap containing risk/depends/demo produces `WorkspaceSliceTarget` entries with those fields populated. (b) shared status helpers — `getMilestoneStatus`/`getSliceStatus`/`getTaskStatus` return correct statuses for done, in-progress, and pending cases. (c) files API — construct a test `.gsd/` directory, verify the route handler returns the correct tree listing and file content; verify path traversal attempts (`../etc/passwd`, absolute paths) are rejected with 400.
4. Run all verification: the new contract test, the existing test suite (no regressions), and `npm run build:web-host`. Run the grep assertion to confirm no mock data constants remain in any of the five view files.

## Must-Haves

- [ ] `/api/files` returns `.gsd/` directory tree and file content
- [ ] `/api/files` rejects path traversal with 400 status
- [ ] FilesView fetches real `.gsd/` files from the API
- [ ] Hardcoded `gsdFiles` constant removed from `files-view.tsx`
- [ ] Contract test covers workspace index risk/depends/demo, status helpers, and files API security
- [ ] All five view components have zero remaining mock data arrays

## Verification

- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-state-surfaces-contract.test.ts` — all tests pass
- `node --import ./src/resources/extensions/gsd/tests/resolve-ts.mjs --experimental-strip-types --test src/tests/web-bridge-contract.test.ts src/tests/web-onboarding-contract.test.ts src/tests/web-live-interaction-contract.test.ts` — no regressions
- `npm run build:web-host` compiles with zero errors
- `grep -rn 'const roadmapData\|const activityLog\|const recentActivity\|const currentSliceTasks\|const modelUsage\|const gsdFiles\|AutoModeState.*idle.*working' web/components/gsd/roadmap.tsx web/components/gsd/activity-view.tsx web/components/gsd/dashboard.tsx web/components/gsd/files-view.tsx web/components/gsd/dual-terminal.tsx` returns empty

## Observability Impact

- Signals added/changed: `/api/files` returns structured JSON errors with descriptive messages for invalid paths, missing files, and oversized files
- How a future agent inspects this: `curl http://localhost:3000/api/files` for tree, `curl http://localhost:3000/api/files?path=STATE.md` for content
- Failure state exposed: 400 with `{ error: "..." }` for path traversal; 404 for missing files; 413 for oversized files

## Inputs

- `src/web/bridge-service.ts` — `resolveWebConfig()` for project cwd resolution pattern
- `web/app/api/boot/route.ts` — existing route pattern for Next.js API routes in this project
- T01 output: workspace index extended with risk/depends/demo; shared status helpers in `workspace-status.ts`
- T02 output: dashboard and dual-terminal rewired to store

## Expected Output

- `web/app/api/files/route.ts` — new API route serving `.gsd/` directory tree and file content
- `web/components/gsd/files-view.tsx` — rewired to fetch from API, no hardcoded file tree
- `src/tests/web-state-surfaces-contract.test.ts` — new contract test covering workspace index extensions, status helpers, and files API
