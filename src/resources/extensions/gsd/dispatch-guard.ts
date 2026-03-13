import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { milestonesDir, relMilestoneFile } from "./paths.js";
import { parseRoadmapSlices } from "./roadmap-slices.ts";
import { MILESTONE_ID_RE } from "./milestone-id.ts";

const SLICE_DISPATCH_TYPES = new Set([
  "research-slice",
  "plan-slice",
  "replan-slice",
  "execute-task",
  "complete-slice",
]);

function readTrackedFileFromBranch(base: string, branch: string, relPath: string): string | null {
  try {
    return execSync(`git show ${branch}:${relPath}`, {
      cwd: base,
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf-8",
    }).trim();
  } catch {
    return null;
  }
}

function findMilestoneIds(basePath: string): string[] {
  const dir = milestonesDir(basePath);
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => {
        const match = d.name.match(MILESTONE_ID_RE);
        return match ? match[1] : d.name;
      })
      .sort();
  } catch {
    return [];
  }
}

export function getPriorSliceCompletionBlocker(base: string, mainBranch: string, unitType: string, unitId: string): string | null {
  if (!SLICE_DISPATCH_TYPES.has(unitType)) return null;

  const [targetMid, targetSid] = unitId.split("/");
  if (!targetMid || !targetSid) return null;

  // Scan all milestones from disk. Milestones ordered before the target
  // (by sort order) must have all slices complete on main before the target
  // can be dispatched.
  const allMilestoneIds = findMilestoneIds(base);

  for (const mid of allMilestoneIds) {
    // Stop once we reach the target milestone — remaining milestones are "later"
    if (mid === targetMid) break;

    const roadmapRel = relMilestoneFile(base, mid, "ROADMAP");
    if (!roadmapRel) continue;

    const roadmapContent = readTrackedFileFromBranch(base, mainBranch, roadmapRel);
    if (!roadmapContent) continue;

    const slices = parseRoadmapSlices(roadmapContent);
    const incomplete = slices.find(slice => !slice.done);
    if (incomplete) {
      return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${mid}/${incomplete.id} is not complete on ${mainBranch}.`;
    }
  }

  // Check prior slices within the target milestone
  const targetRoadmapRel = relMilestoneFile(base, targetMid, "ROADMAP");
  if (targetRoadmapRel) {
    const roadmapContent = readTrackedFileFromBranch(base, mainBranch, targetRoadmapRel);
    if (roadmapContent) {
      const slices = parseRoadmapSlices(roadmapContent);
      const targetIndex = slices.findIndex(slice => slice.id === targetSid);
      if (targetIndex === -1) return null;

      const incomplete = slices.slice(0, targetIndex).find(slice => !slice.done);
      if (incomplete) {
        return `Cannot dispatch ${unitType} ${unitId}: earlier slice ${targetMid}/${incomplete.id} is not complete on ${mainBranch}.`;
      }
    }
  }

  return null;
}
