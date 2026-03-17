---
estimated_steps: 7
estimated_files: 6
---

# T01: Create project discovery service, API routes, and contract test

**Slice:** S02 — Project discovery, Projects view, and store switching
**Milestone:** M006

## Description

Build the server-side foundation for multi-project: export `detectProjectKind()` from `bridge-service.ts`, extend detection signals (Cargo.toml, go.mod, pyproject.toml), create a `project-discovery-service.ts` that scans one directory level, add two new API routes (`/api/projects` and `/api/preferences`), and write a contract test proving discovery logic. This is standalone work with no browser dependencies — it gives S02's later tasks (store scoping, ProjectsView) endpoints to call.

**Relevant skill:** None required — standard Node.js service + API route + test.

## Steps

1. **Export `detectProjectKind` from `bridge-service.ts`.** The function (line 491) is currently internal (`function detectProjectKind`). Change to `export function detectProjectKind`. The types `ProjectDetectionKind`, `ProjectDetectionSignals`, and `ProjectDetection` (lines 471–488) are already exported. Verify no naming collisions — the function is a pure function using `existsSync`/`readdirSync` from the bridge deps.

2. **Extend detection signals.** In `bridge-service.ts`:
   - Add three new boolean fields to `ProjectDetectionSignals` (line 478): `hasCargo?: boolean`, `hasGoMod?: boolean`, `hasPyproject?: boolean`.
   - In `detectProjectKind()` (after line 498), add checks:
     ```ts
     const hasCargo = checkExists(join(projectCwd, "Cargo.toml"));
     const hasGoMod = checkExists(join(projectCwd, "go.mod"));
     const hasPyproject = checkExists(join(projectCwd, "pyproject.toml"));
     ```
   - Add these to the `signals` object (after line 509).
   - Update the brownfield detection condition (currently `hasGitRepo || hasPackageJson || fileCount > 2`) to also include `|| hasCargo || hasGoMod || hasPyproject`.
   - Make the new fields optional (`?:`) so existing code that creates `ProjectDetectionSignals` objects (like tests) doesn't break.

3. **Add `webPreferencesPath` to `src/app-paths.ts`.** Add: `export const webPreferencesPath = join(appRoot, 'web-preferences.json')`. This is where dev root preference is persisted — `~/.gsd/web-preferences.json`.

4. **Create `src/web/project-discovery-service.ts`.** Define:
   ```ts
   export interface ProjectMetadata {
     name: string;            // directory name
     path: string;            // absolute path
     kind: ProjectDetectionKind;
     signals: ProjectDetectionSignals;
     lastModified: number;    // mtime epoch ms
   }
   ```
   Implement `discoverProjects(devRootPath: string): ProjectMetadata[]`:
   - `readdirSync(devRootPath, { withFileTypes: true })`, filter to `isDirectory()`.
   - Exclude entries matching: `node_modules`, `.git`, names starting with `.` (dotfiles/dotdirs).
   - For each remaining dir: `const fullPath = join(devRootPath, entry.name)`.
   - Call `detectProjectKind(fullPath)` to get kind and signals.
   - Call `statSync(fullPath)` for `mtime`.
   - Return sorted by name (alphabetical).
   - Wrap entire body in try/catch — if `devRootPath` doesn't exist or isn't readable, return empty array.

5. **Create `web/app/api/projects/route.ts`.** Follow the canonical route pattern:
   ```ts
   import { discoverProjects } from "../../../../src/web/project-discovery-service.ts";
   export const runtime = "nodejs";
   export const dynamic = "force-dynamic";
   
   export async function GET(request: Request): Promise<Response> {
     const url = new URL(request.url);
     const root = url.searchParams.get("root");
     if (!root) {
       return Response.json({ error: "Missing ?root= parameter" }, { status: 400 });
     }
     const projects = discoverProjects(root);
     return Response.json(projects);
   }
   ```

6. **Create `web/app/api/preferences/route.ts`.** Follow the canonical route pattern:
   - GET: Read `webPreferencesPath` with `readFileSync`, parse JSON, return. If file doesn't exist, return `{}`.
   - PUT: Read body as JSON, validate shape (`{ devRoot?: string, lastActiveProject?: string }`), write to `webPreferencesPath` with `writeFileSync` (create parent dir with `mkdirSync` if needed). Return the written preferences.
   - Import `webPreferencesPath` from `../../../../src/app-paths.ts`.
   - Use `existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` from `node:fs`.

7. **Create `src/tests/web-project-discovery-contract.test.ts`.** Using `node:test` and `node:assert/strict`:
   - **Setup:** `mkdtempSync` a temp root dir. Create subdirectories:
     - `project-a/` with `package.json` (empty `{}`) and `.git/` dir → should be "brownfield"
     - `project-b/` with `.gsd/` dir → should be "empty-gsd"
     - `project-c/` with `Cargo.toml` (empty file) → should be "brownfield" (Cargo detected)
     - `project-d/` (empty) → should be "blank"
     - `.hidden/` → should be excluded
     - `node_modules/` → should be excluded
   - **Test cases:**
     - `discoverProjects(tempRoot)` returns 4 entries (a, b, c, d)
     - Each entry has correct `kind`
     - `project-a` signals have `hasPackageJson: true, hasGitRepo: true`
     - `project-c` signals have `hasCargo: true`
     - `.hidden` and `node_modules` are not present
     - All entries have `lastModified` as a number > 0
     - Results are sorted alphabetically by name
   - **Edge cases:**
     - `discoverProjects("/nonexistent/path")` returns empty array
   - **Teardown:** `rmSync(tempRoot, { recursive: true })` in an `after()` hook.

## Must-Haves

- [ ] `detectProjectKind` is exported from `bridge-service.ts`
- [ ] `ProjectDetectionSignals` includes optional `hasCargo`, `hasGoMod`, `hasPyproject` fields
- [ ] `webPreferencesPath` is exported from `app-paths.ts`
- [ ] `discoverProjects()` returns correct `ProjectMetadata[]` for mixed project types
- [ ] `/api/projects?root=` route compiles and returns JSON array
- [ ] `/api/preferences` GET/PUT route compiles and persists to `~/.gsd/web-preferences.json`
- [ ] Contract test passes with correct detection kinds and signal values

## Verification

- `npm run test:unit -- --test-name-pattern "project-discovery"` — all discovery contract tests pass
- `npm run build` — TypeScript compilation exits 0
- `rg "export function detectProjectKind" src/web/bridge-service.ts` — confirms export
- `rg "webPreferencesPath" src/app-paths.ts` — confirms export

## Inputs

- `src/web/bridge-service.ts` — `detectProjectKind()` at line 491 (currently `function`, needs `export`); types `ProjectDetectionKind`, `ProjectDetectionSignals`, `ProjectDetection` at lines 471–488 (already exported)
- `src/app-paths.ts` — existing pattern: `export const X = join(appRoot, 'file')` (8 lines)
- `web/app/api/boot/route.ts` — canonical route pattern: `import from "../../../../src/web/..."`, `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, async GET handler
- `src/tests/web-multi-project-contract.test.ts` — test pattern: `node:test`, `node:assert/strict`, temp dirs with `mkdtempSync`

## Observability Impact

- **New inspection surfaces:** `/api/projects?root=<path>` returns project list with kinds and signals — inspectable by any agent or curl. `/api/preferences` GET returns current dev root and last active project — shows configuration state.
- **Failure visibility:** `discoverProjects()` returns `[]` for missing/unreadable dev root (no throw). `/api/projects` returns `400` with error body when `?root=` param is missing. `/api/preferences` GET returns `{}` when no preferences file exists yet.
- **Detection signals extended:** `ProjectDetectionSignals` now includes `hasCargo`, `hasGoMod`, `hasPyproject` — visible in `/api/projects` response for each project, enabling future agents to inspect why a project was classified as "brownfield".
- **Contract test:** `web-project-discovery-contract.test.ts` proves detection correctness with temp fixtures — run with `--test-name-pattern "project-discovery"`.

## Expected Output

- `src/web/bridge-service.ts` — `detectProjectKind` exported, signals extended
- `src/web/project-discovery-service.ts` — new: `ProjectMetadata` interface, `discoverProjects()` function
- `src/app-paths.ts` — new `webPreferencesPath` export
- `web/app/api/projects/route.ts` — new: GET handler returning discovered projects
- `web/app/api/preferences/route.ts` — new: GET/PUT handler for dev root persistence
- `src/tests/web-project-discovery-contract.test.ts` — new: contract test with 7+ assertions
