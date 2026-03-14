/**
 * QuestionCard components for discuss mode.
 *
 * QuestionCardView: pure render (no hooks), testable via direct function call.
 * QuestionCard: stateful wrapper that owns selection and submission state.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { QuestionCardPayload } from "@/server/chat-types";

export interface QuestionCardViewProps {
  question: QuestionCardPayload;
  selectedAnswer: string | null;
  freeTextValue: string;
  confirming: boolean;
  onSelectOption: (value: string) => void;
  onConfirm: () => void;
  onFreeTextChange: (value: string) => void;
  onFreeTextSubmit: () => void;
  builderMode?: boolean;
}

/** Pure render -- no hooks. Testable via direct function call. */
export function QuestionCardView({
  question,
  selectedAnswer,
  freeTextValue,
  confirming,
  onSelectOption,
  onConfirm,
  onFreeTextChange,
  onFreeTextSubmit,
  builderMode,
}: QuestionCardViewProps) {
  return (
    <div className="animate-in slide-in-from-bottom duration-200 flex flex-col gap-4 rounded-xl bg-navy-800 border border-cyan-accent/30 p-6 m-4 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        {builderMode ? null : (
          <span className="text-xs font-display uppercase tracking-wider text-cyan-accent">
            {question.area}
          </span>
        )}
        <span className="text-xs text-slate-400 font-mono">
          {`Question ${question.questionNumber} of ${question.totalQuestions}`}
        </span>
      </div>

      {/* Question text */}
      <p className="text-sm text-slate-100 font-sans leading-relaxed">
        {question.question}
      </p>

      {/* Answer area */}
      {question.type === "multiple_choice" ? (
        <div className="flex flex-col gap-2">
          {question.options?.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelectOption(opt.value)}
              className={cn(
                "w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors",
                selectedAnswer === opt.value
                  ? "border-cyan-accent bg-cyan-accent/10 text-cyan-accent"
                  : "border-navy-600 text-slate-300 hover:border-cyan-accent/50"
              )}
            >
              {opt.label}
            </button>
          ))}
          {selectedAnswer !== null && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={confirming}
              className="mt-2 w-full px-4 py-2 rounded-lg bg-cyan-accent text-navy-900 text-sm font-semibold hover:bg-cyan-accent/90 disabled:opacity-50 transition-colors"
            >
              {confirming ? "Confirming..." : "Confirm"}
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={freeTextValue}
            onChange={(e) => onFreeTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && freeTextValue.trim()) onFreeTextSubmit();
            }}
            placeholder="Type your answer..."
            className="w-full px-4 py-2 rounded-lg border border-navy-600 bg-navy-900 text-slate-100 text-sm placeholder:text-slate-500 focus:outline-none focus:border-cyan-accent/50"
          />
          <button
            type="button"
            onClick={onFreeTextSubmit}
            disabled={!freeTextValue.trim()}
            className="w-full px-4 py-2 rounded-lg bg-cyan-accent text-navy-900 text-sm font-semibold hover:bg-cyan-accent/90 disabled:opacity-50 transition-colors"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}

/** Stateful wrapper — owns selectedAnswer, freeTextValue, confirming state. */
export function QuestionCard({
  question,
  onAnswer,
  builderMode,
}: {
  question: QuestionCardPayload;
  onAnswer: (answer: string) => void;
  builderMode?: boolean;
}) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [freeTextValue, setFreeTextValue] = useState("");
  const [confirming, setConfirming] = useState(false);

  return (
    <QuestionCardView
      question={question}
      selectedAnswer={selectedAnswer}
      freeTextValue={freeTextValue}
      confirming={confirming}
      onSelectOption={setSelectedAnswer}
      onConfirm={() => {
        if (selectedAnswer) {
          setConfirming(true);
          onAnswer(selectedAnswer);
        }
      }}
      onFreeTextChange={setFreeTextValue}
      onFreeTextSubmit={() => {
        if (freeTextValue.trim()) onAnswer(freeTextValue.trim());
      }}
      builderMode={builderMode}
    />
  );
}
