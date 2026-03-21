# ADR: Browser Automation — Playwright/Chromium vs Lightpanda

**Status:** Proposed
**Date:** 2026-03-20
**Deciders:** Jeremy McSpadden

---

## Context

GSD-2 ships a `browser-tools` PI extension that gives coding agents 47 browser automation tools (navigation, interaction, capture, inspection, testing, network, etc.). It is built on **Playwright + Chromium** and is a core feature of the product.

The question: should we evaluate or migrate to **Lightpanda** (`lightpanda-io/browser`), a from-scratch headless browser written in Zig that exposes a CDP-compatible WebSocket endpoint?

---

## Current Architecture: Playwright + Chromium

### How it works
- `playwright` npm package (v1.58.2) is a direct production dependency
- `lifecycle.ts` launches a Chromium process via `chromium.launch()`
- 47 tools are built on Playwright's Node.js API surface
- Headless mode is auto-detected via `DISPLAY` env var; falls back to headed if display is available
- HAR recording, device emulation, screenshots, PDFs, visual diffing all rely on Chromium's rendering engine
- Tests in `browser-tools-integration.test.mjs` spin up a real Chromium instance

### Feature surface currently used
| Category | Tools | Chromium Requirement |
|---|---|---|
| Navigation | navigate, back/forward, reload, pages, frames | Low |
| Interaction | click, drag, type, scroll, hover, key press | Low–Medium |
| Screenshots | full-page, viewport, element (JPEG/PNG) | **High — requires renderer** |
| PDF export | save_pdf | **High — requires renderer** |
| Visual diff | pixel-by-pixel regression | **High — requires renderer** |
| DOM/A11y | accessibility tree, page source, find | Low |
| Network | mock routes, block URLs, HAR export | Medium |
| Console/Network logs | get_console_logs, get_network_logs | Low |
| Device emulation | mobile/tablet presets | Medium |
| State persistence | cookies, localStorage, sessionStorage | Low |
| Test codegen | record → export Playwright test | Medium |
| Data extraction | structured extraction with schema | Low |

---

## Candidate: Lightpanda

### What it is
A purpose-built headless browser for automation and AI agents, written from scratch in Zig. Not a Chromium fork. Uses v8 for JS, libcurl for HTTP, html5ever for HTML parsing. Exposes Chrome DevTools Protocol (CDP) over WebSocket on port 9222.

### Performance profile

| Metric | Chromium | Lightpanda | Ratio |
|---|---|---|---|
| Memory per instance | ~450 MB | ~50 MB | **9x better** |
| 25 parallel instances | ~2 GB | ~123 MB | **16x better** |
| Startup time | 2–5 seconds | <100 ms | **30x better** |
| 100 pages crawled | 25.2 sec | 2.3 sec | **11x better** |

### API compatibility
- CDP-compatible → Playwright and Puppeteer can `connect()` to it (no `launch()`)
- Requires `playwright-core` (no bundled browsers) instead of `playwright`
- Same CDP domains as Chrome for most common operations
- **One connection, one context, one page per process** (significant constraint)

### Status
- Beta — nightly builds, actively developed
- ~5% real-world error rate on complex pages
- Available for Linux x86_64 and macOS aarch64
- License: **AGPL-3.0**

### Hard limitations
| Limitation | Impact on gsd-2 |
|---|---|
| No screenshots | **Breaks `browser_screenshot`, `browser_visual_diff`** |
| No PDF generation | **Breaks `browser_save_pdf`** |
| Single page per process | **Breaks multi-tab workflows, `browser_list_pages`, `browser_switch_page`** |
| Incomplete Web API coverage | May fail on complex JS-heavy sites (~5% error rate) |
| No rendering engine | No IntersectionObserver, canvas, WebGL, CSS layout |
| Bot detection | Cloudflare Turnstile, FingerprintJS will detect it |
| AGPL-3.0 license | Requires legal review for commercial distribution |
| Beta stability | Not suitable as sole engine for production features |

---

## Decision Matrix

| Criterion | Playwright/Chromium | Lightpanda |
|---|---|---|
| Screenshot/PDF support | ✅ Full | ❌ None |
| Multi-tab support | ✅ Full | ❌ Single page/process |
| Visual regression testing | ✅ Full | ❌ None |
| Device emulation | ✅ Full | ⚠️ Partial |
| JS compatibility | ✅ Near-complete | ⚠️ ~95% |
| Memory efficiency | ❌ Heavy (450 MB/instance) | ✅ Light (50 MB/instance) |
| Startup latency | ❌ Slow (2–5 sec) | ✅ Fast (<100 ms) |
| Parallel scaling | ❌ Expensive | ✅ Excellent |
| Production stability | ✅ Mature | ⚠️ Beta, ~5% errors |
| Bot detection bypass | ✅ Better | ❌ Detected by advanced shields |
| License | MIT | ⚠️ AGPL-3.0 |
| macOS support | ✅ Full | ✅ aarch64 |
| Linux support | ✅ Full | ✅ x86_64 |

---

## Options

### Option A: Stay with Playwright/Chromium (status quo)
Keep the current architecture unchanged.

**Pros:**
- Zero migration risk
- Full feature parity (all 47 tools work)
- Mature, stable, well-tested
- MIT license, no legal complexity

**Cons:**
- High memory footprint when multiple browser sessions are active
- Slow startup affects agent responsiveness for quick tasks

---

### Option B: Replace Playwright with Lightpanda
Swap the browser engine entirely to Lightpanda via CDP `connect()`.

**Pros:**
- Dramatic memory and speed gains

**Cons:**
- Loses screenshots, PDFs, visual diffing — 3+ tools become non-functional
- Loses multi-tab support — core UX patterns break
- Beta stability introduces production risk
- AGPL license has commercial implications
- Single-page-per-process means high-concurrency scenarios require process management

**Verdict:** Not viable without significant feature regression.

---

### Option C: Hybrid — Lightpanda for text-only tasks, Chromium fallback for rendering tasks (RECOMMENDED)

Run Lightpanda as the **default engine** for fast, text/DOM-centric operations. Automatically fall back to Chromium when a tool requires rendering capabilities.

**Routing logic:**
```
Rendering required (screenshot, pdf, visual_diff) → Chromium
Multi-tab workflow → Chromium
Standard DOM/interaction/extraction → Lightpanda (default)
```

**Integration approach:**
1. Add Lightpanda as an optional binary (downloaded on first use, similar to how Playwright downloads Chromium browsers)
2. In `lifecycle.ts`, introduce an `EngineAdapter` abstraction with `LightpandaEngine` and `PlaywrightEngine` implementations
3. `LightpandaEngine` connects to a managed Lightpanda process via `playwright-core` CDP `connect()`
4. Tools that require rendering capabilities declare a `requiresRenderer: true` flag → engine router selects Playwright automatically
5. Expose a `BROWSER_ENGINE=lightpanda|chromium|auto` env var (default: `auto`)

**Pros:**
- Best performance for the majority of agent workflows (navigation, extraction, interaction)
- Preserves all existing tool capabilities
- Reduces cloud compute costs for high-throughput scraping scenarios
- Opt-in: users who don't install Lightpanda get existing behavior unchanged

**Cons:**
- Implementation complexity (~2–3 days engineering)
- Two binaries to maintain and version
- AGPL license for Lightpanda binary must be reviewed — if distributed, source obligations apply; if user downloads separately, likely okay
- Lightpanda beta risk still applies to text-only path (~5% errors)

---

## Recommendation

**Option C (Hybrid)** is the right long-term direction but should be treated as a **non-urgent enhancement**, not a migration.

### Rationale
1. **The rendering-dependent tools are high-value** — screenshots, visual diffing, and PDFs are frequently used features. Dropping them is not acceptable.
2. **Lightpanda's single-page-per-process constraint is a hard architectural mismatch** with multi-tab workflows that agents depend on.
3. **The performance gains are real but not urgent** — current Chromium usage is session-scoped and not high-concurrency. The bottleneck for most users is LLM latency, not browser startup time.
4. **Beta stability and AGPL license need resolution** before shipping to users.

### Suggested next steps (if pursued)
1. File a GitHub issue to track Lightpanda as an optional engine
2. Monitor Lightpanda for GA release and multi-context support
3. Legal review of AGPL-3.0 distribution implications
4. Prototype `EngineAdapter` abstraction in a feature branch when Lightpanda reaches 1.0

---

## References

- Current implementation: `src/resources/extensions/browser-tools/lifecycle.ts`
- Lightpanda repo: https://github.com/lightpanda-io/browser
- Lightpanda docs: https://lightpanda.io/docs/quickstart/your-first-test
- Lightpanda CDP compatibility: 17 implemented domains
- WPT test results: https://wpt.lightpanda.io
- License: AGPL-3.0 — https://github.com/lightpanda-io/browser/blob/main/LICENSE
