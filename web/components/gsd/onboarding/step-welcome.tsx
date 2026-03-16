"use client"

import { ArrowRight, KeyRound, Puzzle, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface StepWelcomeProps {
  onNext: () => void
}

export function StepWelcome({ onNext }: StepWelcomeProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Hero icon */}
      <div className="relative mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-border/70 bg-card shadow-lg shadow-black/20">
          <Zap className="h-9 w-9 text-foreground" strokeWidth={1.5} />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background">
          <div className="h-2 w-2 animate-pulse rounded-full bg-foreground" />
        </div>
      </div>

      <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        Set up your workspace
      </h2>

      <p className="mt-3 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
        A few quick steps to connect a model provider and unlock the live shell.
        Takes about a minute.
      </p>

      <Separator className="my-8 max-w-xs" />

      {/* What we'll do */}
      <div className="grid w-full max-w-md gap-4 text-left">
        <div className="flex items-start gap-4 rounded-xl border border-border/50 bg-card/60 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Connect a provider</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              API key or browser sign-in — one is enough
            </div>
          </div>
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-border/50 bg-card/60 px-4 py-3.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground">
            <Puzzle className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-medium text-foreground">Optional integrations</div>
            <div className="mt-0.5 text-sm text-muted-foreground">
              Extra tools — skip any time, configure later
            </div>
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-8 gap-2 px-8 text-base"
        onClick={onNext}
        data-testid="onboarding-start"
      >
        Get started
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
