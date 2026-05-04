export function shouldSkipHeavyJobs({ eventName, mergeableState }) {
  if (eventName !== "pull_request") return false;
  return mergeableState === "dirty";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const eventName = process.env.GITHUB_EVENT_NAME ?? "";
  const mergeableState = process.env.PR_MERGEABLE_STATE ?? "unknown";
  const skip = shouldSkipHeavyJobs({ eventName, mergeableState });
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    console.error("GITHUB_OUTPUT is required");
    process.exit(1);
  }

  const fs = await import("node:fs/promises");
  await fs.appendFile(outputPath, `skip-heavy-jobs=${skip ? "true" : "false"}\n`, "utf-8");
}
