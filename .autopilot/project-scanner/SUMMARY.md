// [Project Scanner - Executive Summary]
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

# Project Scanner Summary

GSD-2 is a high-ambition coding-agent platform with stronger orchestration internals than most competitors: disk-backed state, worktree isolation, autonomous milestone execution, recovery logic, and a substantial extension ecosystem. The repo is not missing core vision. It is missing some refinement in startup efficiency, review ergonomics, and repo-wide quality gates.

The highest-value work is concentrated in three areas: remove avoidable startup churn, close the most obvious shell/dependency security gaps, and package existing power-user capability into first-class review and IDE workflows.

## Scorecard

| Category | Grade |
|---|---|
| Architecture | B |
| Security | C- |
| Performance | C+ |
| Feature Completeness | B- |
| Developer Experience | C |

## Strengths

- Strong local autonomy model with fresh-session dispatch, crash recovery, and milestone workflow.
- Clear product differentiation through worktree isolation, metrics, planning artifacts, and parallel orchestration.
- Sensible use of Rust for performance-sensitive primitives.
- Rich bundled extension ecosystem, especially browser-tools and remote/headless support.

## Critical Findings

- Shell-interpolated URL openers and git fallback commands create avoidable code-execution risk.
- Warm startup still performs unconditional managed-resource sync despite comments saying it should skip on version match.
- CI/test coverage does not reflect the true shipped surface: native, browser-tools, packages, and the VS Code extension are under-gated.
- Review and changed-file approval workflows are weaker than the current market baseline.
- Dependency auditing and patching lag the repo’s real workspace footprint.

## Top 5 Recommendations

1. Replace shell-string browser openers and git fallbacks with argument-based process execution.
2. Fix dependency audit coverage and patch the currently reported AWS/file-type vulnerabilities.
3. Skip managed-resource sync on warm startup and keep extension discovery metadata cached.
4. Add first-class PR/review workflows plus IDE-native changed-file review UX.
5. Expand CI to cover browser-tools, native packages, package-level tests, and the VS Code extension.

## Next Steps

- Start with the security fixes and warm-start sync fix.
- In parallel, harden CI coverage for the surfaces already being shipped.
- After that, invest in review UX and VS Code parity because those are the clearest product gaps versus current competitors.

## Scan Metadata

- Scan date: 2026-03-17
- Files inspected: root CLI, GSD extension, VS Code extension, native build pipeline, test/CI configs, key docs
- Dependency scan: local `npm audit --omit=dev --json`
- External comparison sources:
  - https://docs.github.com/en/copilot/how-tos/use-copilot-agents/request-a-code-review/use-code-review
  - https://docs.cursor.com/bugbot
  - https://docs.cursor.com/en/background-agents
  - https://code.visualstudio.com/updates/v1_104
  - https://docs.anthropic.com/en/docs/claude-code/slash-commands
- Total recommendations: 13

## Full Reports

- `research/ecosystem.md`
- `research/security.md`
- `research/performance.md`
- `research/features.md`
- `research/developer-experience.md`
- `reports/GAP-ANALYSIS.md`
- `reports/RECOMMENDATIONS.md`
