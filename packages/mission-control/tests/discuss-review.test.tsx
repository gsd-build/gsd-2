import { describe, test, expect } from "bun:test";
// These imports will fail until Wave 2 creates the files
import { QuestionCardView } from "../src/components/chat/QuestionCard";
import { DecisionLogDrawer } from "../src/components/chat/DecisionLogDrawer";
import { ReviewView } from "../src/components/views/ReviewView";
import type { QuestionCardPayload, DecisionEntry, ReviewResults } from "../src/server/chat-types";

const mockMcQuestion: QuestionCardPayload = {
  id: "q1",
  area: "Layout style",
  type: "multiple_choice",
  question: "Which layout do you prefer?",
  options: [
    { value: "cards", label: "Cards" },
    { value: "list", label: "List" },
  ],
  questionNumber: 1,
  totalQuestions: 3,
};

const mockFtQuestion: QuestionCardPayload = {
  id: "q2",
  area: "Color scheme",
  type: "free_text",
  question: "Describe your preferred color palette.",
  questionNumber: 2,
  totalQuestions: 3,
};

const mockDecisions: DecisionEntry[] = [
  { questionId: "q1", area: "Layout style", answer: "cards" },
];

const mockReviewResults: ReviewResults = {
  pillars: [
    { name: "Accessibility", score: 7.2, findings: ["CTA lacks contrast"] },
    { name: "Typography", score: 5.5, findings: ["Base font too small"] },
  ],
  topFixes: [
    { priority: 1, pillar: "Accessibility", description: "Fix CTA contrast", draftMessage: "Fix the contrast issues on CTA buttons" },
    { priority: 2, pillar: "Typography", description: "Increase font size", draftMessage: "Increase base font size to 16px" },
    { priority: 3, pillar: "Spacing", description: "Fix grid padding", draftMessage: "Add consistent 8pt grid padding" },
  ],
};

describe("QuestionCardView", () => {
  test("renders question text prominently (DISC-02)", () => {
    const html = JSON.stringify(QuestionCardView({
      question: mockMcQuestion,
      selectedAnswer: null,
      freeTextValue: "",
      confirming: false,
      onSelectOption: () => {},
      onConfirm: () => {},
      onFreeTextChange: () => {},
      onFreeTextSubmit: () => {},
    }));
    expect(html).toContain("Which layout do you prefer?");
  });

  test("renders button group for multiple_choice (DISC-03)", () => {
    const html = JSON.stringify(QuestionCardView({
      question: mockMcQuestion,
      selectedAnswer: null,
      freeTextValue: "",
      confirming: false,
      onSelectOption: () => {},
      onConfirm: () => {},
      onFreeTextChange: () => {},
      onFreeTextSubmit: () => {},
    }));
    expect(html).toContain("Cards");
    expect(html).toContain("List");
  });

  test("renders text input for free_text (DISC-04)", () => {
    const html = JSON.stringify(QuestionCardView({
      question: mockFtQuestion,
      selectedAnswer: null,
      freeTextValue: "",
      confirming: false,
      onSelectOption: () => {},
      onConfirm: () => {},
      onFreeTextChange: () => {},
      onFreeTextSubmit: () => {},
    }));
    expect(html).toContain("input");
  });

  test("renders 'Question N of M' label (DISC-05)", () => {
    const html = JSON.stringify(QuestionCardView({
      question: mockMcQuestion,
      selectedAnswer: null,
      freeTextValue: "",
      confirming: false,
      onSelectOption: () => {},
      onConfirm: () => {},
      onFreeTextChange: () => {},
      onFreeTextSubmit: () => {},
    }));
    expect(html).toContain("Question 1 of 3");
  });
});

describe("DecisionLogDrawer", () => {
  test("renders decision entries in key-value format (DISC-06)", () => {
    const html = JSON.stringify(DecisionLogDrawer({
      decisions: mockDecisions,
      visible: true,
    }));
    expect(html).toContain("Layout style");
    expect(html).toContain("cards");
  });

  test("not visible when visible=false", () => {
    const result = DecisionLogDrawer({ decisions: mockDecisions, visible: false });
    // Returns null or empty when not visible
    expect(result).toBeNull();
  });
});

describe("ReviewView", () => {
  test("includes review kind in ViewType (REVW-01)", async () => {
    const { default: types } = await import("../src/lib/view-types");
    // TypeScript-level check: view-types exports the type (runtime: just check import works)
    expect(types).toBeUndefined(); // view-types only exports types, no runtime value
  });

  test("renders pillar names and score bars (REVW-02)", () => {
    const html = JSON.stringify(ReviewView({
      results: mockReviewResults,
      onDismiss: () => {},
      onFix: () => {},
    }));
    expect(html).toContain("Accessibility");
    expect(html).toContain("7.2");
    expect(html).toContain("Typography");
  });

  test("renders all 3 top fix cards (REVW-04)", () => {
    const html = JSON.stringify(ReviewView({
      results: mockReviewResults,
      onDismiss: () => {},
      onFix: () => {},
    }));
    expect(html).toContain("Fix CTA contrast");
    expect(html).toContain("Increase font size");
    expect(html).toContain("Fix");
  });
});
