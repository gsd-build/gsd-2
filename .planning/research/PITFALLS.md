# Pitfalls Research

**Domain:** Bun-powered local React dashboard with file watching, WebSocket state sync, and Claude Code child process integration
**Researched:** 2026-03-10
**Confidence:** HIGH (most pitfalls verified through multiple sources including official Bun issues and Claude Code GitHub)

## Critical Pitfalls

### Pitfall 1: Claude Code Child Process Orphaning

**What goes wrong:**
When Mission Control spawns Claude Code as a child process via `Bun.spawn` or `node:child_process`, and the parent process crashes, is killed, or the terminal is closed, the Claude Code subprocess continues running indefinitely. Each orphaned process consumes 50-100MB of RAM. After a day of development, dozens of orphaned processes can accumulate and exhaust system memory.

**Why it happens:**
AbortController-based cleanup only works if the parent is alive to call `abort()`. If the parent dies via SIGKILL, OOM, or hard crash, no cleanup runs. Bun's process spawning has the same fundamental limitation as Node.js here -- there is no automatic parent-death signal on Windows.

**How to avoid:**
1. Track all spawned Claude Code processes in a Set and register cleanup on `process.on('exit')`, `SIGINT`, `SIGTERM`, and `uncaughtException`.
2. On startup, scan for orphaned Claude processes from previous sessions and offer to kill them.
3. Set `idleTimeout` on Claude processes -- if no stdout activity for 5 minutes, assume stale and terminate.
4. Use `detached: false` (default) so processes are in the same process group.
5. Consider writing the child PID to a `.planning/.mc-pids` file so the next startup can clean up.

**Warning signs:**
- Rising memory usage over time during development sessions.
- `ps aux | grep claude` shows multiple Claude processes when only one chat session is active.
- System becomes sluggish after extended use.

**Phase to address:**
Phase 3 (Chat Panel / Claude Code integration). Must be designed into the process management layer from day one, not bolted on after.

---

### Pitfall 2: File Watcher Race Condition -- Reading Empty or Partial Files

**What goes wrong:**
The file watcher fires a "modify" event the instant the OS begins writing a file, but the file contents may be empty or partially written at the moment the dashboard reads it. This causes the dashboard to render empty panels, show parse errors for half-written JSON, or flash incorrect state before settling.

**Why it happens:**
File systems emit events mid-write. Editors use atomic saves (write temp file, then rename), which produce create+rename event sequences rather than a single modify event. GSD's `gsd-tools.cjs` writes JSON and markdown files -- if the write is not atomic, the watcher reads a truncated file. Bun's file watcher can miss rapid-succession events, compounding the problem.

**How to avoid:**
1. Debounce file change events by 50-100ms per file path (not globally). Use a Map of path-to-timer.
2. After debounce fires, validate file content before processing: check JSON.parse succeeds, check file is non-empty, check markdown has expected structure.
3. On validation failure, retry once after 50ms -- the write likely has not finished.
4. Never replace current valid state with invalid state. If the new file read fails validation, keep the previous state and log a warning.
5. For `.planning/` JSON files specifically, wrap reads in try/catch and treat parse failures as "file still writing."

**Warning signs:**
- Dashboard panels flash empty briefly on file save.
- Console shows JSON parse errors intermittently.
- State appears to "flicker" between old and new values.

**Phase to address:**
Phase 1 (Bun server + file watcher). The debounce-and-validate pattern must be the foundation of the file watching layer.

---

### Pitfall 3: WebSocket State Divergence Between Server and Client

**What goes wrong:**
The server's in-memory representation of `.planning/` state drifts from what the client believes is current. This happens when WebSocket messages are dropped during reconnection, when the client processes messages out of order, or when the server sends a diff update but the client's base state does not match what the server assumed.

**Why it happens:**
Bun closes WebSocket connections after 120 seconds of idle time by default. If the developer is reading docs or thinking, the connection silently drops. On reconnect, the client may miss intermediate state changes. Additionally, if the server sends delta updates (changed fields only), any single missed message corrupts all subsequent state on the client.

**How to avoid:**
1. Set `idleTimeout: 0` on the Bun WebSocket server to disable the 120-second auto-close, or implement application-level ping/pong every 30 seconds.
2. Use a hybrid sync strategy: send full state snapshots on connection/reconnection, send diffs during active sessions.
3. Include a monotonic version number with every message. Client tracks the last version it received. On reconnect, client sends its version; server responds with either a diff from that version or a full snapshot if the gap is too large.
4. Client should detect gaps (version N+2 received but not N+1) and request a full resync.
5. Never rely on WebSocket delivery order alone -- include timestamps or sequence numbers.

**Warning signs:**
- Dashboard shows stale data after leaving the tab idle for a few minutes.
- Panel data does not match what is in the actual `.planning/` files.
- Refreshing the page "fixes" display issues.

**Phase to address:**
Phase 1 (WebSocket layer). The version-based sync protocol must be designed before any panel consumes WebSocket data.

---

### Pitfall 4: Bun.serve Routes + WebSocket TypeScript Type Conflict

**What goes wrong:**
Bun.serve's TypeScript types disallow specifying `routes` and `websocket` configuration together, even though the runtime handles both correctly. This causes TypeScript compilation errors that block the build or force `@ts-ignore` comments throughout the server code.

**Why it happens:**
A known Bun type definition bug (issues #17849, #17871, #18314). The runtime supports both features simultaneously, but the TypeScript types use a discriminated union that makes them mutually exclusive.

**How to avoid:**
1. Create a typed wrapper around `Bun.serve` that uses a type assertion internally:
   ```typescript
   function createServer(config: MissionControlServerConfig) {
     return Bun.serve(config as any); // Single controlled assertion point
   }
   ```
2. Encapsulate the `as any` in one place rather than scattering `@ts-ignore` across the codebase.
3. Add a `// TODO: Remove when Bun fixes #17871` comment so this gets cleaned up.
4. Write integration tests that verify both routes and WebSocket work at runtime, since TypeScript cannot catch regressions here.

**Warning signs:**
- TypeScript errors on `Bun.serve` configuration that "should work."
- Developers adding `@ts-ignore` in multiple places.

**Phase to address:**
Phase 1 (Bun server setup). Handle this on day one with the typed wrapper pattern.

---

### Pitfall 5: Claude Code Spawn Hanging from JavaScript Runtimes

**What goes wrong:**
Spawning Claude Code from Node.js (and by extension Bun) with piped stdio causes the process to hang indefinitely. The `exec()` or `spawn()` call never returns, even though the same command works from Python or direct shell execution.

**Why it happens:**
Claude Code's stdio handling interacts poorly with Node.js/Bun's default pipe buffering. The issue is specifically related to stdin configuration -- when stdin is set to `'pipe'` (the default), Claude Code may wait for input that never comes, or buffer coordination between the runtimes deadlocks.

**How to avoid:**
1. Use `stdio: ['inherit', 'pipe', 'pipe']` -- inherit stdin from the parent process, pipe stdout and stderr.
2. If stdin piping is needed (for sending follow-up messages to a session), use `Bun.spawn` with explicit stdin writing and closing:
   ```typescript
   const proc = Bun.spawn(['claude', '--print', '-p', prompt, '--output-format', 'stream-json'], {
     stdin: 'pipe',
     stdout: 'pipe',
     stderr: 'pipe',
   });
   proc.stdin.write(input);
   proc.stdin.end(); // Critical -- must signal end of input
   ```
3. Always set a timeout on Claude Code processes. If no output arrives within 30 seconds, kill and retry.
4. Test the spawn pattern early in development -- this is a "works or doesn't" integration point, not a gradual degradation.

**Warning signs:**
- Chat panel sends a message and spinner never stops.
- Process list shows a Claude process with 0% CPU (stuck waiting for input).
- Works in terminal but not from the dashboard.

**Phase to address:**
Phase 3 (Chat integration). Build a proof-of-concept spawn before committing to the architecture. Test on Windows specifically since the project is being developed there.

---

### Pitfall 6: Bun Windows-Specific Instability

**What goes wrong:**
Bun's Windows support, while functional, has more rough edges than macOS/Linux. File watchers may behave differently, child process spawning has had console-window-flashing bugs, and path handling can differ. The project is being developed on Windows 11, making this directly relevant.

**Why it happens:**
Bun's core was built for POSIX systems (macOS, Linux). Windows support was added later and, as of early 2026, still has approximately 4.8k open issues. JavaScriptCore (Bun's engine) comes from Apple and requires adaptation for Windows. While Anthropic's acquisition of Bun (December 2025) may accelerate improvements, Windows is not yet at parity.

**How to avoid:**
1. Test every Bun API used (file watcher, WebSocket, spawn) on Windows early -- do not assume Linux docs apply perfectly.
2. For file paths, always use `path.join()` or `path.resolve()` -- never hardcode forward slashes in path construction.
3. Keep Bun version pinned in `package.json` engines field. Upgrade deliberately, testing after each bump.
4. Have a fallback plan for file watching: if Bun's native watcher proves unreliable on Windows, `chokidar` via `node:fs` compatibility is available.
5. For child process spawning on Windows, use the full path to executables and handle `.cmd`/`.exe` extension resolution.

**Warning signs:**
- Tests pass in CI (Linux) but fail locally (Windows).
- File watcher misses events or fires duplicates on Windows but not macOS.
- Child process spawn works on macOS contributor machines but not on the primary Windows dev environment.

**Phase to address:**
Phase 1 (Foundation). Validate all core Bun APIs on Windows before building features on top of them.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Full state snapshots on every file change instead of diffs | Simpler implementation, no state tracking needed | Bandwidth waste, unnecessary re-renders as `.planning/` grows | MVP/Phase 1 only. Switch to diffs in Phase 2 when panel count increases. |
| `@ts-ignore` on Bun.serve config | Quick unblock | Scattered suppressions, missed real type errors | Never scattered. Acceptable only in a single typed wrapper function. |
| Polling file system instead of watcher | Simpler, avoids watcher edge cases | CPU waste, delayed updates (100ms+ latency) | Fallback only if Bun watcher proves unreliable on Windows. |
| Storing all panel state in a single React context | Simple data flow for 5 panels | Every file change re-renders every panel | Phase 1 only. Split into per-panel contexts or use signals before Phase 2. |
| Spawning new Claude process per message | No session management needed | Slow (cold start each time), no conversation context | Never. Session persistence is core to the chat UX. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code CLI | Using `exec()` with default stdio | Use `spawn()` with `stdio: ['inherit', 'pipe', 'pipe']` or explicit stdin management |
| Claude Code CLI | Not handling `--dangerously-skip-permissions` | This flag must be accepted interactively once before non-interactive use works. Guide user through first-time setup. |
| Claude Code CLI | Assuming `--output-format stream-json` gives clean newline-delimited JSON | Output may include partial lines or interleaved stderr. Parse line-by-line, validate each JSON chunk. |
| `gsd-tools.cjs` | Calling it via `Bun.spawn` assuming Bun compatibility | `gsd-tools.cjs` is a Node.js script. Spawn with `node gsd-tools.cjs`, not `bun gsd-tools.cjs`, unless verified compatible. |
| Bun WebSocket | Forgetting `server.upgrade(req)` returns boolean | Must check return value. If upgrade fails, you must return a Response. Returning undefined without successful upgrade crashes. |
| Bun file watcher | Watching root `.planning/` and expecting recursive events | Verify `recursive: true` works on Windows. If not, watch each subdirectory explicitly. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Calling `setState` on every WebSocket message | UI freezes during rapid file saves, dropped frames | Buffer messages in a ref, flush on `requestAnimationFrame` or 16ms interval | When 3+ files change within 100ms (common during GSD operations) |
| Re-parsing entire `.planning/` directory on any file change | Noticeable lag (200ms+) between save and panel update | Parse only the changed file, merge into existing state tree | When `.planning/` has 20+ files (normal for multi-milestone projects) |
| Resizable panel layout using JS-based measurements | Resize handles lag behind cursor, layout jank | Use CSS `resize` or `react-resizable-panels` (shadcn/ui's Resizable uses this). Avoid measuring DOM on every mouse move. | With 5 panels, any JS-measurement approach becomes visibly laggy |
| Streaming Claude Code stdout directly to React state | Render on every character, hundreds of re-renders per second | Buffer output, flush to state every 50-100ms, use CSS animation for typewriter effect | Any response longer than a few sentences |
| Watching node_modules or .git inside project directories | File watcher overwhelmed, CPU spikes | Explicit ignore list: `node_modules`, `.git`, `dist`, `build`. Watch only `.planning/` specifically. | Immediately, on any project with dependencies installed |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Preview iframe loading arbitrary localhost URLs without sandboxing | Malicious dev server could access Mission Control's DOM or cookies | Use `sandbox="allow-scripts allow-same-origin"` on iframe. Strip credentials from proxy requests as specified in PRD. |
| Claude Code `--dangerously-skip-permissions` enabled without user consent | Arbitrary file system and command execution | Never auto-enable. Require explicit user confirmation in the UI. Show clear warning about what this permits. |
| Logging Claude API keys or conversation content to console | Keys visible in terminal scrollback, content leakage | Strip ANTHROPIC_API_KEY from spawned process env logging. Never log full Claude responses at DEBUG level. |
| WebSocket server binding to 0.0.0.0 instead of 127.0.0.1 | Dashboard accessible from network, exposing file system read access | Bind to `127.0.0.1` (localhost only). The PRD says "no data leaves local machine" -- enforce this at the network layer. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| No loading states while file watcher initializes | User sees empty panels and thinks the app is broken | Show skeleton loaders with "Scanning .planning/ directory..." message. PRD requires loading states for every panel. |
| Chat message appears sent but Claude process fails silently | User waits forever for a response | Show process spawn status. If no stdout within 5 seconds, show "Claude is starting..." If 15 seconds, show retry button. |
| Panel resize resets on page refresh | User re-arranges layout every session | Persist panel sizes to localStorage. Restore on mount. `react-resizable-panels` supports this via `autoSaveId`. |
| Real-time updates cause content to jump while user is reading | User loses their place in milestone details or task lists | Pause updates on panels the user is actively interacting with (hover/focus). Queue updates and apply when focus leaves. |
| WebSocket disconnect shows no indicator | User thinks they are seeing live data but connection died 2 minutes ago | Show a persistent "Reconnecting..." banner. Color-code the connection status in the UI chrome. |

## "Looks Done But Isn't" Checklist

- [ ] **File watcher:** Often missing debounce -- verify rapid saves (Ctrl+S spam) do not cause flickering or parse errors
- [ ] **WebSocket reconnection:** Often missing full state resync -- verify disconnecting WiFi for 30s then reconnecting shows correct state
- [ ] **Claude Code chat:** Often missing process cleanup -- verify closing the dashboard kills all child processes (check `ps aux`)
- [ ] **Panel layout:** Often missing persistence -- verify refreshing the page keeps panel sizes
- [ ] **Empty states:** Often missing for edge cases -- verify new project with no `.planning/` files shows helpful onboarding, not errors
- [ ] **Error boundaries:** Often missing per-panel -- verify one panel crashing (bad JSON) does not take down the entire dashboard
- [ ] **Keyboard navigation:** Often missing on custom panels -- verify Tab key moves through all interactive elements in logical order
- [ ] **Mobile layout:** Often missing responsive breakpoints -- verify 375px viewport shows bottom-tab navigation, not squished panels

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| State divergence (WebSocket) | LOW | Full page refresh triggers reconnect and full state snapshot. Build this as a manual "Resync" button too. |
| Orphaned Claude processes | LOW | Kill all matching processes on startup. Add a "Kill All Sessions" button in the UI for manual recovery. |
| File watcher missing events | LOW | Implement manual "Refresh" that re-reads all `.planning/` files. Automatic periodic full-scan every 60 seconds as safety net. |
| Corrupt panel layout state in localStorage | LOW | Clear localStorage for layout keys. Add "Reset Layout" in settings. |
| Bun crash during Claude process spawn | MEDIUM | Wrap all spawn calls in try/catch. Show user-friendly error with "Restart Server" guidance. Log crash details. |
| TypeScript type conflicts blocking build | MEDIUM | Maintain a `bun-type-overrides.d.ts` file with all Bun type workarounds in one place. Document each override with issue link. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| File watcher race conditions | Phase 1 (Bun server) | Rapid-save stress test: save file 10 times in 1 second, verify no parse errors in logs |
| WebSocket state divergence | Phase 1 (WebSocket layer) | Disconnect test: kill WebSocket, wait 30s, verify state is correct after reconnect |
| Bun.serve type conflict | Phase 1 (Server setup) | TypeScript compiles without `@ts-ignore` outside the single wrapper function |
| Bun Windows instability | Phase 1 (Foundation) | All file watcher, WebSocket, and spawn tests pass on Windows 11 |
| React re-render storms | Phase 2 (Panel layout) | React DevTools Profiler shows no unnecessary re-renders during idle state |
| Claude Code spawn hanging | Phase 3 (Chat panel) | Proof-of-concept: spawn Claude, send prompt, receive streamed response within 10 seconds |
| Claude Code process orphaning | Phase 3 (Chat panel) | Kill Mission Control process, verify no orphaned Claude processes remain after 5 seconds |
| Claude Code permissions setup | Phase 3 (Chat panel) | First-time user flow: app detects missing permissions, guides through setup, blocks chat until ready |
| Preview iframe security | Phase 4 (Live preview) | Verify iframe cannot access parent window DOM or make fetch requests to Mission Control's server |
| Mobile layout breakpoints | Phase 5 (Polish) | 375px viewport shows bottom-tab nav, all panels accessible, no horizontal scroll |

## Sources

- [Bun file watcher CPU loop bug (#27667)](https://github.com/oven-sh/bun/issues/27667) -- fixed, but illustrates watcher fragility
- [Bun file watcher API docs](https://bun.com/docs/guides/read-file/watch)
- [Bun WebSocket 100% CPU (#23536)](https://github.com/oven-sh/bun/issues/23536)
- [Bun.serve routes + websocket type conflict (#17871)](https://github.com/oven-sh/bun/issues/17871)
- [Claude Code Node.js spawn bug (#771)](https://github.com/anthropics/claude-code/issues/771)
- [Claude Code orphaned processes (#142)](https://github.com/anthropics/claude-agent-sdk-typescript/issues/142)
- [Claude Code process exhaustion blog post](https://shivankaul.com/blog/claude-code-process-exhaustion)
- [Bun Windows stability discussion (#27664)](https://github.com/oven-sh/bun/issues/27664)
- [Bun workspaces docs](https://bun.com/docs/pm/workspaces)
- [Bun monorepo workspace issues (fgbyte blog)](https://www.fgbyte.com/blog/02-bun-turborepo-hell/)
- [react-resizable-panels layout shift (#240)](https://github.com/bvaughn/react-resizable-panels/issues/240)
- [Deno file watcher race condition (#13035)](https://github.com/denoland/deno/issues/13035) -- same pattern applies to Bun
- [Bun child process stale package cleanup (#25015)](https://github.com/oven-sh/bun/issues/25015)

---
*Pitfalls research for: GSD Mission Control -- Bun-powered local dashboard with Claude Code integration*
*Researched: 2026-03-10*
