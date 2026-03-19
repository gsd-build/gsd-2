/**
 * B4: no_project_loaded gate — pipeline must not allow chat before project selection.
 */
import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pipelineTs = readFileSync(
  resolve(import.meta.dir, "../src/server/pipeline.ts"),
  "utf-8"
);

describe("B4: no_project_loaded gate in pipeline.ts", () => {
  it("declares projectSelected flag initialized to false", () => {
    expect(pipelineTs).toContain("let projectSelected = false");
  });

  it("emits no_project_loaded event on client connect when not selected", () => {
    expect(pipelineTs).toContain("no_project_loaded");
  });

  it("rejects chat messages when project not selected", () => {
    expect(pipelineTs).toContain("No project selected. Open a project first.");
  });

  it("sets projectSelected to true in switchProject", () => {
    // projectSelected = true should appear inside the switchProject method
    const switchIdx = pipelineTs.indexOf("async switchProject(");
    const projectSelectedTrueIdx = pipelineTs.indexOf("projectSelected = true", switchIdx);
    expect(projectSelectedTrueIdx).toBeGreaterThan(switchIdx);
  });

  it("checks projectSelected before allowing chat", () => {
    // The !projectSelected check must appear in onChatMessage
    const onChatIdx = pipelineTs.indexOf("onChatMessage:");
    const gateIdx = pipelineTs.indexOf("!projectSelected", onChatIdx);
    expect(gateIdx).toBeGreaterThan(onChatIdx);
  });
});
