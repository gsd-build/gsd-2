# Phase 1: Monorepo + Bun Server Bootstrap - Research

**Researched:** 2026-03-10
**Domain:** Bun workspaces, Bun HTTP server, React 19, Tailwind CSS v4, shadcn/ui
**Confidence:** HIGH

## Summary

This phase establishes a Bun workspace monorepo where `packages/mission-control/` contains a full-stack React 19 application served by Bun's built-in HTTP server on port 4000, while the existing GSD CLI at the repo root remains untouched.

Bun's fullstack dev server (introduced in Bun 1.2+) supports HTML imports that automatically bundle React/TypeScript/CSS with hot module replacement -- no Vite, no webpack, no configuration files beyond `bunfig.toml`. Tailwind CSS v4 integrates via `bun-plugin-tailwind` and a single `@import "tailwindcss"` in CSS. shadcn/ui installs manually with `bun dlx shadcn@latest init` and provides copy-pasted components using Radix primitives.

**Primary recommendation:** Use `bun init --react` inside `packages/mission-control/` as the starting scaffold, then configure the root `package.json` with Bun workspaces and add a root-level `bun run dev` script that starts the Mission Control dev server.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| MONO-01 | Mission Control lives in `packages/mission-control/` workspace | Bun workspaces support `"workspaces": ["packages/*"]` in root package.json; workspace packages get their own package.json |
| MONO-02 | Bun workspace configuration with workspace:* protocol | Bun supports `workspace:*`, `workspace:^`, and `workspace:~` protocols for inter-workspace dependencies |
| MONO-03 | GSD core remains at repo root, publishes independently | Workspaces are additive -- root package.json keeps its existing `name`, `version`, `bin`, `files` fields intact; adding `"workspaces"` does not affect npm publish of root package |
| SERV-01 | Bun server starts with single `bun run dev` command, serving dashboard on :4000 | Bun.serve() accepts `port` option; HTML imports auto-bundle React/TSX; `development: { hmr: true }` enables hot reload |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun | 1.2+ (latest) | Runtime, bundler, package manager, dev server | Project constraint -- sole runtime, no Node/Vite |
| React | 19.x | UI framework | Project constraint from PRD |
| React DOM | 19.x | DOM rendering for React | Required companion to React |
| TypeScript | 5.x (Bun built-in) | Type safety | Bun transpiles TS natively, no tsc needed at runtime |
| Tailwind CSS | 4.x | Utility-first CSS framework | Project constraint; v4 uses CSS-first config with `@import "tailwindcss"` |
| bun-plugin-tailwind | 0.1.x | Bun bundler plugin for Tailwind v4 | Official integration path for Tailwind with Bun's fullstack server |
| shadcn/ui | latest | Component library (copy-paste, not dependency) | Project constraint; uses Radix + Tailwind |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| class-variance-authority | latest | Variant-based component styling | Required by shadcn/ui components |
| clsx | latest | Conditional class merging | Required by shadcn/ui `cn()` utility |
| tailwind-merge | latest | Tailwind class conflict resolution | Required by shadcn/ui `cn()` utility |
| tw-animate-css | latest | Tailwind animation utilities | Required by shadcn/ui for component animations |
| lucide-react | latest | Icon library | Default icon library for shadcn/ui |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Bun fullstack server | Vite + separate server | Vite is explicitly out of scope per project constraints |
| bun-plugin-tailwind | @tailwindcss/postcss | PostCSS adds unnecessary layer; Bun plugin is native integration |
| shadcn/ui | Headless UI, Ark UI | shadcn/ui is the project constraint; others would require different setup |

**Installation (inside `packages/mission-control/`):**
```bash
bun init --react
bun add tailwindcss bun-plugin-tailwind
bun add class-variance-authority clsx tailwind-merge tw-animate-css lucide-react
bun dlx shadcn@latest init
```

## Architecture Patterns

### Recommended Project Structure
```
get-shit-done/                    # Repo root (GSD core -- DO NOT MODIFY)
├── package.json                  # Root: add "workspaces" field only
├── bin/                          # GSD CLI (untouched)
├── commands/                     # GSD commands (untouched)
├── get-shit-done/                # GSD prompts (untouched)
├── packages/
│   └── mission-control/
│       ├── package.json          # name: "@gsd/mission-control"
│       ├── bunfig.toml           # Bun config (plugins, etc.)
│       ├── tsconfig.json         # TypeScript config with path aliases
│       ├── components.json       # shadcn/ui config
│       ├── src/
│       │   ├── server.ts         # Bun.serve() entry point
│       │   ├── frontend.tsx      # React DOM entry (createRoot)
│       │   ├── App.tsx           # Root React component
│       │   ├── styles/
│       │   │   └── globals.css   # Tailwind imports + shadcn theme
│       │   ├── components/
│       │   │   └── ui/           # shadcn/ui components land here
│       │   ├── lib/
│       │   │   └── utils.ts      # cn() utility
│       │   └── hooks/            # Custom React hooks
│       └── public/
│           └── index.html        # HTML entry (references frontend.tsx + globals.css)
```

### Pattern 1: Bun Fullstack HTML Import
**What:** Import an HTML file in the server entry; Bun auto-bundles all referenced scripts and stylesheets.
**When to use:** Always -- this is the primary pattern for serving React from Bun.
**Example:**
```typescript
// src/server.ts
// Source: https://bun.com/docs/bundler/fullstack
import homepage from "../public/index.html";

Bun.serve({
  port: 4000,
  routes: {
    "/": homepage,
  },
  development: {
    hmr: true,
    console: true,
  },
});

console.log("Mission Control running at http://localhost:4000");
```

```html
<!-- public/index.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>GSD Mission Control</title>
  <link rel="stylesheet" href="../src/styles/globals.css" />
</head>
<body class="dark">
  <div id="root"></div>
  <script type="module" src="../src/frontend.tsx"></script>
</body>
</html>
```

```tsx
// src/frontend.tsx
// Source: https://bun.com/docs/guides/ecosystem/react
import { createRoot } from "react-dom/client";
import App from "./App";

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

### Pattern 2: Bun Workspace Root Script Delegation
**What:** Root `package.json` defines a `dev` script that runs the Mission Control server from the workspace.
**When to use:** To satisfy `bun run dev` from repo root.
**Example:**
```json
// Root package.json (add these fields, keep everything else)
{
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run --cwd packages/mission-control dev"
  }
}
```

```json
// packages/mission-control/package.json
{
  "name": "@gsd/mission-control",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "bun --hot src/server.ts",
    "build": "bun build --production src/server.ts --outdir dist"
  }
}
```

### Pattern 3: Tailwind v4 CSS-First Configuration
**What:** Tailwind v4 uses `@import "tailwindcss"` in CSS instead of a config file. Theme customization via `@theme` blocks.
**When to use:** All styling in this project.
**Example:**
```css
/* src/styles/globals.css */
/* Source: https://tailwindcss.com/blog/tailwindcss-v4 */
@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

@theme {
  --color-navy-base: #0F1419;
  --color-cyan-accent: #5BC8F0;
  --font-display: "Share Tech Mono", monospace;
  --font-mono: "JetBrains Mono", monospace;
}
```

### Pattern 4: bunfig.toml Plugin Configuration
**What:** Configure Bun plugins via bunfig.toml for the fullstack server.
**When to use:** Required for Tailwind CSS processing with Bun's bundler.
**Example:**
```toml
# packages/mission-control/bunfig.toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

### Anti-Patterns to Avoid
- **Installing Vite or webpack:** Bun IS the bundler. Adding another bundler creates conflicts and is explicitly out of scope.
- **Using `tailwind.config.js`:** Tailwind v4 uses CSS-first configuration. A JS config file is the v3 pattern.
- **Modifying root GSD files:** The root package.json gets ONLY `"workspaces"` and a `"dev"` script added. No changes to `bin`, `files`, `name`, `version`, etc.
- **Using `npm` or `node` anywhere:** Bun is the sole runtime. Use `bun add` not `npm install`, `bun dlx` not `npx`.
- **Creating a `packages/mission-control/node_modules/.bin` path manually:** Bun handles hoisting and resolution automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSS class merging | Custom class concatenation | `cn()` from clsx + tailwind-merge | Handles Tailwind conflicts correctly (e.g., `p-4` vs `p-2`) |
| Component variants | Switch statements for styles | class-variance-authority (cva) | Type-safe, composable variant definitions |
| Dev server HMR | Custom file watcher + reload | Bun's `development: { hmr: true }` | Built into the runtime, zero config |
| CSS processing | PostCSS pipeline | bun-plugin-tailwind | Native Bun integration, no postcss.config.js needed |
| Project scaffolding | Manual file creation | `bun init --react` then customize | Gets React + TS + correct tsconfig baseline |

**Key insight:** Bun's fullstack server eliminates the entire Vite/webpack configuration layer. The server IS the bundler. Fighting this (e.g., trying to use PostCSS separately) creates unnecessary complexity.

## Common Pitfalls

### Pitfall 1: Root package.json Breaks npm Publish
**What goes wrong:** Adding `"workspaces"` to root package.json could theoretically interfere with `npm publish` of the GSD core package.
**Why it happens:** Workspaces affect how `npm pack`/`npm publish` resolves the package.
**How to avoid:** The `"files"` field in root package.json already explicitly lists what gets published (`bin`, `commands`, `get-shit-done`, etc.). The `packages/` directory is NOT listed in `"files"`, so it won't be included in the published package. Verify with `npm pack --dry-run` after adding workspaces.
**Warning signs:** `npm pack` output includes files from `packages/`.

### Pitfall 2: bun-plugin-tailwind Version Immaturity
**What goes wrong:** `bun-plugin-tailwind` is at v0.1.x -- it may have bugs or missing features.
**Why it happens:** Bun's fullstack bundler and its plugin ecosystem are relatively new.
**How to avoid:** Test early that Tailwind classes render correctly. If the plugin fails, fallback to running `@tailwindcss/cli` as a build step: `bunx @tailwindcss/cli -i ./src/styles/globals.css -o ./src/styles/output.css --watch`.
**Warning signs:** Missing or broken Tailwind styles in the browser, build errors referencing CSS processing.

### Pitfall 3: Path Aliases Not Resolving in Bun Bundler
**What goes wrong:** `@/components/...` imports work at runtime but fail during `bun build` or in HTML import bundling.
**Why it happens:** Bun reads tsconfig.json paths for runtime resolution, but the bundler may have separate path resolution.
**How to avoid:** Keep tsconfig.json `paths` simple with `"@/*": ["./src/*"]`. Test that imports resolve in both `bun --hot` dev mode and `bun build` production mode.
**Warning signs:** Module not found errors only in production builds.

### Pitfall 4: shadcn/ui Init Assumes Vite or Next.js
**What goes wrong:** Running `bun dlx shadcn@latest init` may try to detect a framework and fail or misconfigure for Bun.
**Why it happens:** shadcn CLI looks for vite.config, next.config, etc.
**How to avoid:** Use manual installation if the CLI fails. Create `components.json` manually, add dependencies with `bun add`, and create the `cn()` utility by hand. The CLI is just scaffolding -- all it does is create files you can write yourself.
**Warning signs:** CLI errors about unsupported framework, or generating incorrect config paths.

### Pitfall 5: Existing package-lock.json Conflicts with bun.lock
**What goes wrong:** The repo has a `package-lock.json` from npm. Running `bun install` at root creates `bun.lock` alongside it, causing confusion.
**Why it happens:** Two package managers with different lockfile formats.
**How to avoid:** Keep both lockfiles. The root GSD project uses npm (it's a published npm package). Mission Control uses Bun. The `package-lock.json` is for npm publish of the root; `bun.lock` is for the workspace development. Add `bun.lock` to `.gitignore` if it causes issues, OR commit it for reproducible workspace installs.
**Warning signs:** Different dependency versions between npm and Bun resolution.

### Pitfall 6: Windows-Specific Bun Issues
**What goes wrong:** Bun on Windows may have quirks with file watching, path resolution, or Unix-style paths.
**Why it happens:** Bun's Windows support is newer than macOS/Linux.
**How to avoid:** Install the latest Bun version. Test file serving and HMR on Windows specifically. Use forward slashes in all configuration paths.
**Warning signs:** File change events not triggering, path resolution failures with backslashes.

## Code Examples

### Complete server.ts
```typescript
// Source: https://bun.com/docs/bundler/fullstack
import homepage from "../public/index.html";

const server = Bun.serve({
  port: 4000,
  routes: {
    "/": homepage,
  },
  development: {
    hmr: true,
    console: true,
  },
  fetch(req) {
    // Fallback for unmatched routes
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`Mission Control running at ${server.url}`);
```

### Complete tsconfig.json for Mission Control
```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

### Complete components.json for shadcn/ui
```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/styles/globals.css",
    "baseColor": "neutral",
    "cssVariables": true,
    "prefix": ""
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils",
    "ui": "@/components/ui",
    "lib": "@/lib",
    "hooks": "@/hooks"
  },
  "iconLibrary": "lucide"
}
```

### cn() Utility
```typescript
// src/lib/utils.ts
// Source: https://ui.shadcn.com/docs/installation/manual
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(...inputs));
}
```

### Minimal App.tsx Proving React + Tailwind Work
```tsx
// src/App.tsx
export default function App() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F1419]">
      <h1 className="font-mono text-2xl text-[#5BC8F0]">
        GSD Mission Control
      </h1>
    </div>
  );
}
```

### Root package.json Additions (Minimal Changes)
```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "dev": "bun run --cwd packages/mission-control dev"
  }
}
```
Note: These fields are ADDED to the existing root package.json. All existing fields remain unchanged.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Vite + React | Bun fullstack server + HTML imports | Bun 1.2 (2025) | No bundler config files needed |
| tailwind.config.js | CSS `@theme` blocks | Tailwind v4 (Jan 2025) | Zero JS config, CSS-first |
| @tailwind directives | `@import "tailwindcss"` | Tailwind v4 | Single import replaces 3 directives |
| PostCSS for Tailwind | bun-plugin-tailwind | 2025 | Native Bun integration |
| npx create-react-app | `bun init --react` | Bun 1.2+ | Scaffolds fullstack React + server |

**Deprecated/outdated:**
- `@tailwind base; @tailwind components; @tailwind utilities;` -- replaced by `@import "tailwindcss"` in v4
- `tailwind.config.js` / `tailwind.config.ts` -- replaced by CSS `@theme` in v4
- `postcss-import` plugin -- Tailwind v4 has built-in `@import` support
- `create-react-app` -- abandoned project, Bun/Vite are successors

## Open Questions

1. **bun-plugin-tailwind stability on Windows**
   - What we know: Plugin is at v0.1.x, relatively new
   - What's unclear: Whether it works reliably on Windows with Bun's fullstack server
   - Recommendation: Test immediately in Wave 0. Have fallback plan using `@tailwindcss/cli` as a parallel watch process

2. **shadcn/ui CLI compatibility with Bun-only projects**
   - What we know: CLI supports `bun dlx shadcn@latest init` and has a manual installation path
   - What's unclear: Whether `init` works without a Vite or Next.js config file present
   - Recommendation: Try CLI first; if it fails, manual installation is straightforward (5 files to create)

3. **Dual lockfile management (package-lock.json + bun.lock)**
   - What we know: Root uses npm for publishing, workspaces use Bun
   - What's unclear: Whether `bun install` at root respects existing package-lock.json behavior
   - Recommendation: Run `bun install` and verify root GSD package still works with `npm pack --dry-run`

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | none -- Bun test runs .test.ts files by convention |
| Quick run command | `bun test --cwd packages/mission-control` |
| Full suite command | `bun test --cwd packages/mission-control` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MONO-01 | `packages/mission-control/` exists as workspace | smoke | `bun run --cwd packages/mission-control --version` | No -- Wave 0 |
| MONO-02 | workspace:* protocol configured | smoke | `cat packages/mission-control/package.json \| grep workspace` | No -- Wave 0 |
| MONO-03 | GSD core root unchanged and publishable | smoke | `npm pack --dry-run 2>&1 \| grep -v packages/` | No -- Wave 0 |
| SERV-01 | Bun server starts and serves page on :4000 | integration | `bun run --cwd packages/mission-control dev & sleep 2 && curl -s http://localhost:4000 \| grep -q "root"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test --cwd packages/mission-control`
- **Per wave merge:** Full suite + manual verification of `bun run dev` serving on :4000
- **Phase gate:** Full suite green + manual `curl localhost:4000` returns HTML with React mount point

### Wave 0 Gaps
- [ ] `packages/mission-control/tests/setup.test.ts` -- covers MONO-01, MONO-02 (workspace structure validation)
- [ ] `packages/mission-control/tests/server.test.ts` -- covers SERV-01 (server starts and responds on :4000)
- [ ] Bun test runner is built-in, no framework install needed

## Sources

### Primary (HIGH confidence)
- [Bun Workspaces](https://bun.com/docs/pm/workspaces) - workspace config, workspace:* protocol, dependency hoisting
- [Bun HTTP Server](https://bun.com/docs/runtime/http/server) - Bun.serve() API, port config, routes, development mode
- [Bun Fullstack Dev Server](https://bun.com/docs/bundler/fullstack) - HTML imports, React bundling, HMR, CSS handling, bun-plugin-tailwind
- [Bun React Guide](https://bun.com/docs/guides/ecosystem/react) - `bun init --react`, project structure, dev/build commands
- [Bun tsconfig paths](https://bun.com/docs/guides/runtime/tsconfig-paths) - Path alias resolution at runtime
- [Tailwind CSS v4 Blog](https://tailwindcss.com/blog/tailwindcss-v4) - CSS-first config, @import, @theme, breaking changes
- [shadcn/ui Manual Installation](https://ui.shadcn.com/docs/installation/manual) - Dependencies, components.json, cn() utility

### Secondary (MEDIUM confidence)
- [shadcn/ui Installation](https://ui.shadcn.com/docs/installation) - Framework options, CLI usage with Bun
- [bun-plugin-tailwind npm](https://www.npmjs.com/package/bun-plugin-tailwind) - Plugin version and bunfig.toml config

### Tertiary (LOW confidence)
- WebSearch results on bun-plugin-tailwind Windows stability - needs hands-on validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries specified in project constraints, verified against official docs
- Architecture: HIGH - Bun fullstack server pattern well-documented with HTML imports
- Pitfalls: MEDIUM - some items (Windows quirks, plugin stability) need hands-on validation

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (Bun releases frequently; check for breaking changes)
