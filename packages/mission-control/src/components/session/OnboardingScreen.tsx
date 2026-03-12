/**
 * OnboardingScreen — full-screen welcome for new projects.
 *
 * Shows LogoAnimation at size="lg", then fades in welcome text
 * and action buttons after animation completes.
 */
import { useState } from "react";
import { LogoAnimation } from "@/components/session/LogoAnimation";

interface OnboardingScreenProps {
  onOpenFolder: () => void;
  onStartChat: () => void;
}

interface OnboardingScreenViewProps {
  animationComplete: boolean;
  onOpenFolder: () => void;
  onStartChat: () => void;
}

/**
 * Pure render function for testing (no hooks).
 */
export function OnboardingScreenView({
  animationComplete,
  onOpenFolder,
  onStartChat,
}: OnboardingScreenViewProps) {
  return (
    <div className="flex h-screen flex-col items-center justify-center bg-navy-base">
      <LogoAnimation size="lg" />

      <div
        className={`mt-8 flex flex-col items-center gap-4 transition-opacity duration-500 ${
          animationComplete ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="font-display text-lg text-cyan-accent">
          Welcome to GSD Mission Control
        </h1>
        <p className="text-sm text-slate-400">
          Open a project folder to get started, or type /gsd:new-project in chat
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onOpenFolder}
            className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-navy-600"
          >
            Open Folder
          </button>
          <button
            onClick={onStartChat}
            className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30"
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * OnboardingScreen with animation state management.
 */
export function OnboardingScreen({ onOpenFolder, onStartChat }: OnboardingScreenProps) {
  const [animationComplete, setAnimationComplete] = useState(false);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-navy-base">
      <LogoAnimation size="lg" onComplete={() => setAnimationComplete(true)} />

      <div
        className={`mt-8 flex flex-col items-center gap-4 transition-opacity duration-500 ${
          animationComplete ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="font-display text-lg text-cyan-accent">
          Welcome to GSD Mission Control
        </h1>
        <p className="text-sm text-slate-400">
          Open a project folder to get started, or type /gsd:new-project in chat
        </p>
        <div className="mt-4 flex gap-3">
          <button
            onClick={onOpenFolder}
            className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-navy-600"
          >
            Open Folder
          </button>
          <button
            onClick={onStartChat}
            className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30"
          >
            Start Chat
          </button>
        </div>
      </div>
    </div>
  );
}
