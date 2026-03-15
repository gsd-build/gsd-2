/**
 * OnboardingScreen — full-screen welcome for new projects.
 *
 * Shows LogoAnimation at size="lg", then fades in welcome text
 * and action buttons after animation completes.
 *
 * "New Project" — inline name input → calls onNewProject(name)
 * "Open Project" — opens the folder picker modal
 */
import { useState } from "react";
import { LogoAnimation } from "@/components/session/LogoAnimation";

interface OnboardingScreenProps {
  onOpenProject: () => void;
  onNewProject: (name: string) => void;
}

interface OnboardingScreenViewProps {
  animationComplete: boolean;
  onOpenProject: () => void;
  onNewProject: (name: string) => void;
}

/**
 * Pure render function for testing (no hooks).
 */
export function OnboardingScreenView({
  animationComplete,
  onOpenProject,
  onNewProject,
}: OnboardingScreenViewProps) {
  const [naming, setNaming] = useState(false);
  const [projectName, setProjectName] = useState("");

  function handleCreate() {
    const name = projectName.trim();
    if (!name) return;
    onNewProject(name);
    setProjectName("");
    setNaming(false);
  }

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
          Create a new project or open an existing one to get started
        </p>

        {naming ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <input
              autoFocus
              type="text"
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setNaming(false); setProjectName(""); }
              }}
              className="w-64 rounded-md border border-navy-600 bg-navy-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-accent/60"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setNaming(false); setProjectName(""); }}
                className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-navy-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim()}
                className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-3">
            <button
              onClick={onOpenProject}
              className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-navy-600"
            >
              Open Project
            </button>
            <button
              onClick={() => setNaming(true)}
              className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30"
            >
              New Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * OnboardingScreen with animation state management.
 */
export function OnboardingScreen({ onOpenProject, onNewProject }: OnboardingScreenProps) {
  const [animationComplete, setAnimationComplete] = useState(false);
  const [naming, setNaming] = useState(false);
  const [projectName, setProjectName] = useState("");

  function handleCreate() {
    const name = projectName.trim();
    if (!name) return;
    onNewProject(name);
    setProjectName("");
    setNaming(false);
  }

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
          Create a new project or open an existing one to get started
        </p>

        {naming ? (
          <div className="mt-4 flex flex-col items-center gap-3">
            <input
              autoFocus
              type="text"
              placeholder="Project name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
                if (e.key === "Escape") { setNaming(false); setProjectName(""); }
              }}
              className="w-64 rounded-md border border-navy-600 bg-navy-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-accent/60"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setNaming(false); setProjectName(""); }}
                className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-navy-600"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!projectName.trim()}
                className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Create
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex gap-3">
            <button
              onClick={onOpenProject}
              className="rounded-md bg-navy-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-navy-600"
            >
              Open Project
            </button>
            <button
              onClick={() => setNaming(true)}
              className="rounded-md bg-cyan-accent/20 px-4 py-2 text-sm text-cyan-accent transition-colors hover:bg-cyan-accent/30"
            >
              New Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
