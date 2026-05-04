# CONTEXT

## Domain glossary

- **Auto Orchestration**: runtime coordination of GSD auto-mode units from start to completion, including dispatch, recovery, and stop/resume behavior.
- **Unit**: the smallest executable workflow step (e.g., plan slice, execute task, complete slice).
- **Unit progression**: movement from one Unit to the next under orchestration rules.
- **Dispatch decision**: selection of the next Unit plus rationale and preconditions.
- **Recovery decision**: retry/escalate/abort choice after runtime failure.
- **Runtime persistence**: lock state, transition journal, and any persisted execution state required for safe resume.

## Architecture terms adopted for this area

- **Auto Orchestration module**: the module that owns unit lifecycle control-flow.
- **Dispatch adapter**: adapter behind the Dispatch seam.
- **Recovery adapter**: adapter behind the Recovery seam.
- **Worktree adapter**: adapter behind the Worktree seam.
- **Health adapter**: adapter behind the Health seam.
- **Runtime persistence adapter**: adapter behind the Runtime persistence seam.
- **Notification adapter**: adapter behind the Notification seam.

## Current decision in force

- Auto-mode architecture should deepen around a single Auto Orchestration module with interface:
  - `start(sessionContext)`
  - `advance()`
  - `resume()`
  - `stop(reason)`
  - `getStatus()`

See `docs/dev/ADR-014-auto-orchestration-deep-module.md`.

## Current implementation snapshot (phase 1)

- `auto.ts` now wires a concrete Auto Orchestration module through `createWiredAutoOrchestrationModule(...)`.
- Session state now carries orchestration status via `AutoSession.orchestration`.
- Runtime snapshot exports orchestration telemetry (`orchestrationPhase`, `orchestrationTransitionCount`, `orchestrationLastTransitionAt`).
- Initial adapters are live for Dispatch, Health, and Runtime persistence seams.
- Main auto-loop dispatch is still the existing path; orchestration seam is integrated incrementally for lifecycle and observability.
