import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatMilestoneIssueBody,
  formatSlicePRBody,
  formatTaskIssueBody,
  formatSummaryComment,
} from "../templates.ts";

describe("templates", () => {
  describe("formatMilestoneIssueBody", () => {
    it("includes title and vision", () => {
      const body = formatMilestoneIssueBody({
        id: "M001",
        title: "Build Auth",
        vision: "Secure authentication for all users",
      });
      assert.ok(body.includes("M001: Build Auth"));
      assert.ok(body.includes("Secure authentication"));
    });

    it("renders success criteria as checkboxes", () => {
      const body = formatMilestoneIssueBody({
        id: "M001",
        title: "Auth",
        successCriteria: ["Users can log in", "OAuth works"],
      });
      assert.ok(body.includes("- [ ] Users can log in"));
      assert.ok(body.includes("- [ ] OAuth works"));
    });

    it("renders slice table", () => {
      const body = formatMilestoneIssueBody({
        id: "M001",
        title: "Auth",
        slices: [
          { id: "S01", title: "Core types", taskCount: 3 },
          { id: "S02", title: "OAuth", taskCount: 5 },
        ],
      });
      assert.ok(body.includes("| S01 | Core types | 3 |"));
      assert.ok(body.includes("| S02 | OAuth | 5 |"));
    });
  });

  describe("formatSlicePRBody", () => {
    it("includes goal and must-haves", () => {
      const body = formatSlicePRBody({
        id: "S01",
        title: "Core Auth Types",
        goal: "Define all auth types",
        mustHaves: ["User type", "Session type"],
      });
      assert.ok(body.includes("Define all auth types"));
      assert.ok(body.includes("- User type"));
      assert.ok(body.includes("- Session type"));
    });

    it("renders task checklist with issue links", () => {
      const body = formatSlicePRBody({
        id: "S01",
        title: "Auth",
        tasks: [
          { id: "T01", title: "Types", issueNumber: 43 },
          { id: "T02", title: "Schema" },
        ],
      });
      assert.ok(body.includes("- [ ] T01: Types (#43)"));
      assert.ok(body.includes("- [ ] T02: Schema"));
      assert.ok(!body.includes("T02: Schema (#"));
    });
  });

  describe("formatTaskIssueBody", () => {
    it("includes files and verification", () => {
      const body = formatTaskIssueBody({
        id: "T01",
        title: "Add types",
        files: ["src/types.ts"],
        verifyCriteria: ["Types compile"],
      });
      assert.ok(body.includes("`src/types.ts`"));
      assert.ok(body.includes("- [ ] Types compile"));
    });
  });

  describe("formatSummaryComment", () => {
    it("includes one-liner and body", () => {
      const comment = formatSummaryComment({
        oneLiner: "Added retry logic",
        body: "Implemented exponential backoff",
      });
      assert.ok(comment.includes("**Summary:** Added retry logic"));
      assert.ok(comment.includes("Implemented exponential backoff"));
    });

    it("wraps frontmatter in details block", () => {
      const comment = formatSummaryComment({
        frontmatter: { duration: "45m", key_files: ["a.ts"] },
      });
      assert.ok(comment.includes("<details>"));
      assert.ok(comment.includes("duration:"));
    });

    it("handles empty data gracefully", () => {
      const comment = formatSummaryComment({});
      assert.equal(typeof comment, "string");
    });
  });
});
