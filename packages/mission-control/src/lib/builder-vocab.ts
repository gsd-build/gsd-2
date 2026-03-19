/**
 * builder-vocab.ts — vocabulary label maps for Developer and Builder modes.
 *
 * BUILDER-01: Switching to Builder mode relabels UI terminology.
 * Developer mode: standard GSD terminology (milestone, slice, task, etc.)
 * Builder mode: plain-language equivalents (version, feature, step, etc.)
 */

/** Shape of a vocabulary map — maps GSD terminology keys to display labels. */
export type VocabMap = {
  milestone: string;
  slice: string;
  task: string;
  mustHaves: string;
  uat: string;
  decisionLog: string;
};

/** Default developer vocabulary — standard GSD terminology. */
export const DEVELOPER_VOCAB: VocabMap = {
  milestone: "Milestone",
  slice: "Slice",
  task: "Task",
  mustHaves: "Must-haves",
  uat: "UAT",
  decisionLog: "Decisions",
};

/** Builder mode vocabulary — plain-language equivalents. */
export const BUILDER_VOCAB: VocabMap = {
  milestone: "Version",
  slice: "Feature",
  task: "Step",
  mustHaves: "Goals",
  uat: "Testing",
  decisionLog: "Your decisions so far",
};
