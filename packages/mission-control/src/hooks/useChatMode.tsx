/**
 * useChatMode — manages discuss/review mode state from WebSocket mode events.
 *
 * Opens its own WebSocket connection to the same URL and listens for ModeEvent
 * messages. This avoids modifying useSessionManager while sharing the same
 * server endpoint.
 *
 * State machine:
 *   chat  --discuss_mode_start-->  discuss  --discuss_mode_end-->  chat
 *   chat  --review_mode_start-->   review   --review_mode_end-->   chat
 *
 * Exports:
 * - useChatMode: React hook
 * - ChatModeState: state interface
 */
import { useState, useCallback, useEffect, useRef } from "react";
import { QuestionCard } from "@/components/chat/QuestionCard";
import { DecisionLogDrawer } from "@/components/chat/DecisionLogDrawer";
import { useBuilderMode } from "@/hooks/useBuilderMode";
import type { ModeEvent, QuestionCardPayload, DecisionEntry, ReviewResults } from "@/server/chat-types";

export interface ChatModeState {
  mode: "chat" | "discuss" | "review";
  currentQuestion: QuestionCardPayload | null;
  decisions: DecisionEntry[];
  reviewResults: ReviewResults | null;
  totalQuestions: number;
}

const MODE_EVENT_TYPES = new Set([
  "discuss_mode_start",
  "question_card",
  "decision_logged",
  "discuss_mode_end",
  "review_mode_start",
  "review_mode_end",
]);

export function useChatMode(wsUrl: string, onChatSend: (msg: string) => void) {
  const { builderMode } = useBuilderMode();
  const [mode, setMode] = useState<"chat" | "discuss" | "review">("chat");
  const [currentQuestion, setCurrentQuestion] = useState<QuestionCardPayload | null>(null);
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [reviewResults, setReviewResults] = useState<ReviewResults | null>(null);
  const [totalQuestions, setTotalQuestions] = useState(0);

  // Raw WebSocket ref — we manage our own connection to avoid modifying useReconnectingWebSocket
  const wsRef = useRef<WebSocket | null>(null);
  const onChatSendRef = useRef(onChatSend);
  onChatSendRef.current = onChatSend;

  useEffect(() => {
    let ws: WebSocket;
    let destroyed = false;

    function connect() {
      if (destroyed) return;
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.addEventListener("message", (ev: MessageEvent) => {
        try {
          const data = JSON.parse(ev.data as string) as ModeEvent;
          if (!data.type || !MODE_EVENT_TYPES.has(data.type)) return;
          switch (data.type) {
            case "discuss_mode_start":
              setMode("discuss");
              setDecisions([]);
              setTotalQuestions(data.total ?? 0);
              break;
            case "question_card":
              if (data.question) setCurrentQuestion(data.question);
              break;
            case "decision_logged":
              if (data.decision) {
                setDecisions((prev) => [...prev, data.decision!]);
              }
              setCurrentQuestion(null);
              break;
            case "discuss_mode_end":
              setMode("chat");
              setCurrentQuestion(null);
              break;
            case "review_mode_start":
              setMode("review");
              if (data.results) setReviewResults(data.results);
              break;
            case "review_mode_end":
              setMode("chat");
              setReviewResults(null);
              break;
          }
        } catch {
          // non-JSON or non-mode message — ignore
        }
      });

      ws.addEventListener("close", () => {
        wsRef.current = null;
        // Reconnect after brief delay (backoff not critical for mode events)
        if (!destroyed) {
          setTimeout(connect, 2000);
        }
      });
    }

    connect();

    return () => {
      destroyed = true;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [wsUrl]);

  const answerQuestion = useCallback((answer: string) => {
    onChatSendRef.current(answer);
  }, []);

  const dismissReview = useCallback(() => {
    setMode("chat");
    setReviewResults(null);
  }, []);

  const handleFix = useCallback((draftMessage: string) => {
    onChatSendRef.current(draftMessage);
    setMode("chat");
    setReviewResults(null);
  }, []);

  // Compute overlay React node — only rendered when discuss mode active with a question
  const overlay =
    mode === "discuss" && currentQuestion ? (
      <div className="flex flex-1">
        <div className="flex-1 flex items-center">
          <QuestionCard question={currentQuestion} onAnswer={answerQuestion} builderMode={builderMode} />
        </div>
        <DecisionLogDrawer decisions={decisions} visible={decisions.length > 0} builderMode={builderMode} />
      </div>
    ) : undefined;

  return {
    chatModeState: {
      mode,
      currentQuestion,
      decisions,
      reviewResults,
      totalQuestions,
    } as ChatModeState,
    overlay,
    reviewResults,
    answerQuestion,
    dismissReview,
    handleFix,
  };
}
