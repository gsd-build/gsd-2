/**
 * GSD Command — /gsd graph build|status|query|diff
 *
 * Slash-command surface that mirrors the `gsd graph` CLI subcommands in
 * src/cli.ts. The underlying graph operations live in @gsd-build/mcp-server;
 * we only translate user input/output for the interactive dispatcher.
 *
 * Issue #5148 — wires the missing dispatcher branch noted in PR #4212's gap.
 */

import type { ExtensionCommandContext } from "@gsd/pi-coding-agent";

type NotifyLevel = "info" | "warning" | "error" | "success";

function notify(ctx: ExtensionCommandContext, message: string, level: NotifyLevel): void {
  ctx.ui.notify(message, level);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function handleGraph(
  args: string,
  ctx: ExtensionCommandContext,
  projectDir: string,
): Promise<void> {
  const tokens = args.length > 0 ? args.split(/\s+/).filter(Boolean) : [];
  const sub = tokens[0] ?? "build";

  const { buildGraph, writeGraph, graphStatus, graphQuery, graphDiff, resolveGsdRoot } =
    await import("@gsd-build/mcp-server");

  if (sub === "build") {
    try {
      const gsdRoot = resolveGsdRoot(projectDir);
      const graph = await buildGraph(projectDir);
      await writeGraph(gsdRoot, graph);
      notify(
        ctx,
        `Graph built: ${graph.nodes.length} nodes, ${graph.edges.length} edges`,
        "success",
      );
    } catch (err) {
      notify(ctx, `[gsd] graph build failed: ${errorMessage(err)}`, "error");
    }
    return;
  }

  if (sub === "status") {
    try {
      const result = await graphStatus(projectDir);
      if (!result.exists) {
        notify(ctx, "Graph: not built yet. Run: gsd graph build", "info");
        return;
      }
      const ageDisplay =
        result.ageHours !== undefined ? result.ageHours.toFixed(2) : "n/a";
      notify(
        ctx,
        [
          "Graph status:",
          `  exists:    ${result.exists}`,
          `  nodes:     ${result.nodeCount}`,
          `  edges:     ${result.edgeCount}`,
          `  stale:     ${result.stale}`,
          `  ageHours:  ${ageDisplay}`,
          `  lastBuild: ${result.lastBuild ?? "n/a"}`,
        ].join("\n"),
        "info",
      );
    } catch (err) {
      notify(ctx, `[gsd] graph status failed: ${errorMessage(err)}`, "error");
    }
    return;
  }

  if (sub === "query") {
    const term = tokens[1];
    if (!term) {
      notify(ctx, "Usage: /gsd graph query <term>", "warning");
      return;
    }
    try {
      const result = await graphQuery(projectDir, term);
      if (result.nodes.length === 0) {
        notify(ctx, `No nodes found for term: "${term}"`, "info");
        return;
      }
      const header = `Query results for "${term}" (${result.nodes.length} nodes, ${result.edges.length} edges):`;
      const lines = result.nodes.map(
        (node) => `  [${node.type}] ${node.label} (${node.confidence})`,
      );
      notify(ctx, [header, ...lines].join("\n"), "info");
    } catch (err) {
      notify(ctx, `[gsd] graph query failed: ${errorMessage(err)}`, "error");
    }
    return;
  }

  if (sub === "diff") {
    try {
      const result = await graphDiff(projectDir);
      notify(
        ctx,
        [
          "Graph diff:",
          `  nodes added:    ${result.nodes.added.length}`,
          `  nodes removed:  ${result.nodes.removed.length}`,
          `  nodes changed:  ${result.nodes.changed.length}`,
          `  edges added:    ${result.edges.added.length}`,
          `  edges removed:  ${result.edges.removed.length}`,
        ].join("\n"),
        "info",
      );
    } catch (err) {
      notify(ctx, `[gsd] graph diff failed: ${errorMessage(err)}`, "error");
    }
    return;
  }

  notify(
    ctx,
    `Unknown graph command: ${sub}. Commands: build, status, query <term>, diff`,
    "warning",
  );
}
