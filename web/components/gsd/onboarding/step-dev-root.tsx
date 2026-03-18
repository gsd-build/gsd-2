"use client"

import { useCallback, useState } from "react"
import { ArrowRight, FolderRoot, Loader2, SkipForward } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

interface StepDevRootProps {
  onNext: () => void
  onBack: () => void
}

const SUGGESTED_PATHS = ["~/Projects", "~/Developer", "~/Code", "~/dev"]

export function StepDevRoot({ onNext, onBack }: StepDevRootProps) {
  const [path, setPath] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setPath(suggestion)
    setError(null)
  }, [])

  const handleContinue = useCallback(async () => {
    const trimmed = path.trim()
    if (!trimmed) {
      setError("Enter a path or skip this step")
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devRoot: trimmed }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          (body as { error?: string }).error ?? `Request failed (${res.status})`,
        )
      }

      onNext()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preference")
      console.error("[onboarding] devRoot PUT failed:", err)
    } finally {
      setSaving(false)
    }
  }, [path, onNext])

  return (
    <div className="flex flex-col items-center text-center">
      {/* Hero icon */}
      <div className="relative mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-lg shadow-black/20">
          <FolderRoot className="h-9 w-9 text-foreground" strokeWidth={1.5} />
        </div>
      </div>

      <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        Choose your dev root
      </h2>

      <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
        The folder that contains your projects. GSD will discover and manage
        workspaces inside it.
      </p>

      <Separator className="my-8 max-w-xs" />

      {/* Path input */}
      <div className="w-full max-w-md space-y-4">
        <Input
          value={path}
          onChange={(e) => {
            setPath(e.target.value)
            if (error) setError(null)
          }}
          placeholder="/Users/you/Projects"
          className={cn(
            "h-11 font-mono text-sm",
            error && "border-destructive/50 focus-visible:ring-destructive/30",
          )}
          data-testid="onboarding-devroot-input"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && path.trim()) {
              void handleContinue()
            }
          }}
        />

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {/* Suggested paths */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-xs text-muted-foreground">Suggestions:</span>
          {SUGGESTED_PATHS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                "rounded-full border px-3 py-1 font-mono text-xs transition-colors",
                path === suggestion
                  ? "border-foreground/30 bg-foreground/10 text-foreground"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:border-foreground/20 hover:text-foreground",
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-8 flex w-full max-w-md items-center justify-between">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground"
        >
          Back
        </Button>

        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onNext}
            className="gap-1.5 text-muted-foreground"
            data-testid="onboarding-devroot-skip"
          >
            Skip for now
            <SkipForward className="h-3.5 w-3.5" />
          </Button>

          <Button
            onClick={() => void handleContinue()}
            className="gap-2"
            disabled={saving}
            data-testid="onboarding-devroot-continue"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
