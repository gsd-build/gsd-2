# Decisions Register

<!-- Append-only. Never edit or remove existing rows.
     To reverse a decision, add a new row that supersedes it.
     Read this file at the start of any planning or research phase. -->

| # | When | Scope | Decision | Choice | Rationale | Revisable? |
|---|------|-------|----------|--------|-----------|------------|
| D001 | M001-xij4rf | arch | Rule system unification strategy | Merge dispatch rules + post-unit hooks + pre-dispatch hooks into one flat registry | AI agents need one system to read and modify, not three with different shapes | No |
| D002 | M001-xij4rf | convention | Tool naming format | gsd_concept_action (underscore-delimited) | Anthropic API enforces ^[a-zA-Z0-9_-]{1,128}$ — colons and slashes rejected | No |
| D003 | M001-xij4rf | arch | Journal scope | Orchestration-level events only (dispatch, hooks, state transitions) — not tool calls | Tool calls already captured in .gsd/activity/; journal is the "why" layer, not the "what" layer | No |
| D004 | M001-xij4rf | arch | Journal query interface | LLM-callable registered tool (gsd_journal_query) | AI agents are primary consumers — tool call is native interface, not bash+grep | Yes — if query needs become complex enough to warrant a CLI subcommand |
| D005 | M001-xij4rf | convention | Rule naming style | Keep existing human-readable names (e.g., "summarizing → complete-slice") | Already machine-readable by LLMs; systematic naming adds parsing overhead without benefit | No |
| D006 | M001-xij4rf | arch | Journal storage format | Append-only JSONL at .gsd/journal/YYYY-MM-DD.jsonl, daily rotation | Cheap to write, easy to grep, trivial to parse, natural rotation boundary | No |
