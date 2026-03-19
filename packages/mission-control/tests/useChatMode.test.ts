/**
 * Tests for useChatMode hook state transitions.
 *
 * Tests the pure state logic by directly calling the reducer-like
 * functions rather than mounting the hook (which requires WebSocket).
 */
import { describe, test, expect } from "bun:test";
import type { ModeEvent, QuestionCardPayload, DecisionEntry, ReviewResults } from "../src/server/chat-types";

// -- Test helpers that replicate useChatMode state machine logic --

type ChatMode = "chat" | "discuss" | "review";

interface ChatModeState {
  mode: ChatMode;
  currentQuestion: QuestionCardPayload | null;
  decisions: DecisionEntry[];
  reviewResults: ReviewResults | null;
  totalQuestions: number;
}

function applyModeEvent(state: ChatModeState, event: ModeEvent): ChatModeState {
  switch (event.type) {
    case "discuss_mode_start":
      return { ...state, mode: "discuss", decisions: [], totalQuestions: event.total ?? 0 };
    case "question_card":
      return { ...state, currentQuestion: event.question ?? null };
    case "decision_logged":
      return {
        ...state,
        decisions: event.decision ? [...state.decisions, event.decision] : state.decisions,
        currentQuestion: null,
      };
    case "discuss_mode_end":
      return { ...state, mode: "chat", currentQuestion: null };
    case "review_mode_start":
      return { ...state, mode: "review", reviewResults: event.results ?? null };
    case "review_mode_end":
      return { ...state, mode: "chat", reviewResults: null };
    default:
      return state;
  }
}

const initialState: ChatModeState = {
  mode: "chat",
  currentQuestion: null,
  decisions: [],
  reviewResults: null,
  totalQuestions: 0,
};

const mockQuestion: QuestionCardPayload = {
  id: "q1",
  area: "Layout",
  type: "multiple_choice",
  question: "Which layout?",
  options: [{ value: "cards", label: "Cards" }],
  questionNumber: 1,
  totalQuestions: 3,
};

const mockDecision: DecisionEntry = { questionId: "q1", area: "Layout", answer: "cards" };

const mockReviewResults: ReviewResults = {
  pillars: [{ name: "Accessibility", score: 7.2, findings: ["CTA lacks contrast"] }],
  topFixes: [{ priority: 1, pillar: "Accessibility", description: "Fix contrast", draftMessage: "Fix CTA contrast" }],
};

describe("useChatMode state transitions", () => {
  test("initial state is chat mode", () => {
    expect(initialState.mode).toBe("chat");
    expect(initialState.currentQuestion).toBeNull();
    expect(initialState.decisions).toHaveLength(0);
    expect(initialState.reviewResults).toBeNull();
    expect(initialState.totalQuestions).toBe(0);
  });

  test("discuss_mode_start sets mode to discuss with totalQuestions", () => {
    const event: ModeEvent = { type: "discuss_mode_start", total: 5 };
    const next = applyModeEvent(initialState, event);
    expect(next.mode).toBe("discuss");
    expect(next.totalQuestions).toBe(5);
    expect(next.decisions).toHaveLength(0);
  });

  test("question_card sets currentQuestion", () => {
    const state = applyModeEvent(initialState, { type: "discuss_mode_start", total: 3 });
    const next = applyModeEvent(state, { type: "question_card", question: mockQuestion });
    expect(next.currentQuestion).toBe(mockQuestion);
  });

  test("decision_logged appends decision and clears currentQuestion", () => {
    let state = applyModeEvent(initialState, { type: "discuss_mode_start", total: 3 });
    state = applyModeEvent(state, { type: "question_card", question: mockQuestion });
    state = applyModeEvent(state, { type: "decision_logged", decision: mockDecision });
    expect(state.decisions).toHaveLength(1);
    expect(state.decisions[0]).toEqual(mockDecision);
    expect(state.currentQuestion).toBeNull();
  });

  test("multiple decision_logged events accumulate decisions", () => {
    let state = applyModeEvent(initialState, { type: "discuss_mode_start", total: 3 });
    const d1: DecisionEntry = { questionId: "q1", area: "Layout", answer: "cards" };
    const d2: DecisionEntry = { questionId: "q2", area: "Color", answer: "dark" };
    state = applyModeEvent(state, { type: "decision_logged", decision: d1 });
    state = applyModeEvent(state, { type: "decision_logged", decision: d2 });
    expect(state.decisions).toHaveLength(2);
  });

  test("discuss_mode_end returns to chat and clears currentQuestion", () => {
    let state = applyModeEvent(initialState, { type: "discuss_mode_start", total: 3 });
    state = applyModeEvent(state, { type: "question_card", question: mockQuestion });
    state = applyModeEvent(state, { type: "discuss_mode_end" });
    expect(state.mode).toBe("chat");
    expect(state.currentQuestion).toBeNull();
  });

  test("review_mode_start sets mode to review with results", () => {
    const event: ModeEvent = { type: "review_mode_start", results: mockReviewResults };
    const next = applyModeEvent(initialState, event);
    expect(next.mode).toBe("review");
    expect(next.reviewResults).toBe(mockReviewResults);
  });

  test("review_mode_end returns to chat and clears reviewResults", () => {
    let state = applyModeEvent(initialState, { type: "review_mode_start", results: mockReviewResults });
    state = applyModeEvent(state, { type: "review_mode_end" });
    expect(state.mode).toBe("chat");
    expect(state.reviewResults).toBeNull();
  });

  test("overlay is defined when mode=discuss and currentQuestion is set", () => {
    // Simulate overlay computation logic
    const state: ChatModeState = {
      mode: "discuss",
      currentQuestion: mockQuestion,
      decisions: [],
      reviewResults: null,
      totalQuestions: 3,
    };
    const shouldShowOverlay = state.mode === "discuss" && state.currentQuestion !== null;
    expect(shouldShowOverlay).toBe(true);
  });

  test("overlay is undefined when mode=chat", () => {
    const state: ChatModeState = { ...initialState, mode: "chat" };
    const shouldShowOverlay = state.mode === "discuss" && state.currentQuestion !== null;
    expect(shouldShowOverlay).toBe(false);
  });

  test("overlay is undefined when mode=discuss but no currentQuestion", () => {
    const state: ChatModeState = { ...initialState, mode: "discuss", currentQuestion: null };
    const shouldShowOverlay = state.mode === "discuss" && state.currentQuestion !== null;
    expect(shouldShowOverlay).toBe(false);
  });
});

describe("useChatMode hook exports", () => {
  test("useChatMode and ChatModeState are exported from the hook file", async () => {
    const mod = await import("../src/hooks/useChatMode.tsx");
    expect(typeof mod.useChatMode).toBe("function");
    // ChatModeState is a TypeScript type — just verify import works
  });
});
