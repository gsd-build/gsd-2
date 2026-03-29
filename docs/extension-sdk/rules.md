# Rules

// GSD-2 Extension SDK — Non-negotiable rules, gotchas, and contribution requirements

Non-negotiable rules, common gotchas, and contribution requirements for GSD-2 extensions. Violating any non-negotiable rule will block your PR.

---

## Non-Negotiable Rules

### 1. Use `StringEnum` for string enums

`Type.Union`/`Type.Literal` breaks Google's API. Always use `StringEnum`:

```typescript
// CORRECT
import { StringEnum } from "@gsd/pi-ai";
const Status = StringEnum(["pending", "active", "done"] as const);

// WRONG — breaks Google Gemini
const Status = Type.Union([Type.Literal("pending"), Type.Literal("active"), Type.Literal("done")]);
```

### 2. Truncate tool output

Large tool output causes context overflow. Enforce a maximum of **50 KB / 2000 lines**. Use the truncation helpers from `@gsd/pi-coding-agent`:

```typescript
import { truncateHead, truncateTail } from "@gsd/pi-coding-agent";

const output = truncateTail(rawOutput, { maxBytes: 50_000, maxLines: 2000 });
```

### 3. Use theme from callback params

Never import theme directly. Use the `theme` parameter provided by `ctx.ui.custom()` or render functions:

```typescript
// CORRECT
ctx.ui.custom((tui, theme, kb, done) => { /* use theme here */ });

// WRONG
import { theme } from "@gsd/pi-tui";
```

### 4. Lines must not exceed `width` in `render()`

Use `truncateToWidth()` from `@gsd/pi-tui` to enforce line width:

```typescript
import { truncateToWidth } from "@gsd/pi-tui";

render(width: number) {
  return truncateToWidth(this.label, width);
}
```

### 5. Call `tui.requestRender()` after state changes in `handleInput`

State changes in `handleInput` are not automatically rendered. You must call `tui.requestRender()` to trigger a re-render.

### 6. Return `{ render, invalidate, handleInput }` from custom components

All three methods are required for the component contract. Omitting any of them will cause runtime errors.

### 7. Session control methods only in commands

`waitForIdle()`, `newSession()`, `fork()`, `navigateTree()`, and `reload()` **deadlock** when called from event handlers. Only call them from command handlers.

### 8. Strip leading `@` from path arguments in custom tools

Some models prefix path arguments with `@`. Strip it:

```typescript
const filePath = args.path.replace(/^@/, "");
```

### 9. Store state in tool result `details` for proper branching support

Tool state stored outside of `details` is lost when users branch conversations. Always persist state through the `details` field in tool results.

### 10. Check `signal?.aborted` in long-running tool executions

Long-running tools must periodically check the abort signal to allow cancellation:

```typescript
for (const item of items) {
  if (signal?.aborted) return;
  await processItem(item);
}
```

### 11. Check `ctx.hasUI` before calling dialog methods

`ctx.hasUI` is `false` in non-interactive modes (headless, CI). Guard all dialog calls:

```typescript
if (ctx.hasUI) {
  await ctx.ui.confirm("Confirm?", "This action cannot be undone");
}
```

### 12. Use `pi.exec()` instead of `child_process`

`pi.exec()` handles sandboxing, timeouts, and signal propagation. Direct `child_process` usage bypasses these protections.

### 13. Overlay components are disposed when closed

Create fresh instances each time an overlay is opened. Do not cache or reuse overlay component instances.

### 14. Treat `ctx.reload()` as terminal

Code after `ctx.reload()` runs from the **pre-reload** version. Do not place logic after a `reload()` call — it will execute stale code.

### 15. Rebuild on `invalidate()` when your component pre-bakes theme colors

If your component caches or pre-computes theme-colored strings, rebuild them in `invalidate()` to respond to theme changes.

### 16. Handle all three state reconstruction events

Stateful extensions **must** handle all three events to properly reconstruct state:

- `session_start` — fresh session initialization
- `session_switch` — user switched to a different session
- `session_tree` — conversation tree was restructured (branch, prune)

---

## Common Gotchas

### Empty prefix parsing

`"".trim().split(/\s+/)` returns `['']`, not `[]`. Guard against it:

```typescript
const parts = prefix.trim();
const tokens = parts ? parts.split(/\s+/) : [];
```

### `sendMessage` default mode is `"steer"`

The default mode interrupts streaming. If you want non-interrupting behavior, specify the mode explicitly.

### Tool names must be unique across all extensions

Collisions override silently. If two extensions register a tool with the same name, the last one loaded wins with no warning. Use a namespace prefix for community extensions.

### Extensions load in topological order by manifest dependencies

If your extension depends on events from another extension, declare the dependency in your manifest. Otherwise, load order is not guaranteed and your event handler may never fire.

---

## Contribution Requirements for Bundled Extensions

Every bundled extension PR must include:

1. **`extension-manifest.json`** with accurate `provides` arrays — every tool, command, hook, and shortcut your extension registers must be listed. See [Manifest Spec](manifest-spec.md).
2. **Tests** covering tool registration, command handling, and event hooks. See [Testing](testing.md).
3. **State reconstruction** via `session_start` + `session_switch` + `session_tree` (if stateful). See the [Building Extensions](building-extensions.md) state management section.
4. **Truncation guards** on any variable-length tool output (rule 2 above).
5. **`ctx.hasUI` checks** before dialog methods (rule 11 above).

### Tier Decision Guide

| Use this tier | When |
|---------------|------|
| **core** | Foundational system — cannot be disabled. RFC required. |
| **bundled** | Ships with GSD, user can disable. Default for new features. |
| **community** | User-installed. Lives in `~/.gsd/agent/extensions/`. |

### Promoting Community to Bundled

1. Open an issue describing the extension and why it should be bundled.
2. Move source to `src/resources/extensions/<name>/`.
3. Change tier to `"bundled"` in manifest.
4. Add tests meeting the standards above.
5. Open a PR following the normal [contribution process](../../CONTRIBUTING.md).
