/**
 * GSD branch naming patterns — single source of truth.
 *
 * gsd/<worktree>/<milestone>/<slice>  → SLICE_BRANCH_RE
 * gsd/quick/<id>-<slug>               → QUICK_BRANCH_RE
 * gsd/<workflow-template>/<...>        → WORKFLOW_BRANCH_RE
 */

/** Matches gsd/ slice branches: gsd/[worktree/]M001[-hash]/S01 */
export const SLICE_BRANCH_RE = /^gsd\/(?:([a-zA-Z0-9_-]+)\/)?(M\d+(?:-[a-z0-9]{6})?)\/(S\d+)$/;

/** Matches gsd/quick/ task branches */
export const QUICK_BRANCH_RE = /^gsd\/quick\//;

/** Matches GSD-generated workflow template branches, not arbitrary user gsd/* branches. */
export const WORKFLOW_BRANCH_RE = /^gsd\/(?:hotfix|bugfix|small-feature|refactor|spike|security-audit|dep-upgrade|full-project)\//;
