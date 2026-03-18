"use client"

import { CheckCircle2, Terminal, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

interface StepReadyProps {
  providerLabel: string
  onFinish: () => void
}

export function StepReady({ providerLabel, onFinish }: StepReadyProps) {
  return (
    <div className="flex flex-col items-center text-center">
      {/* Success icon */}
      <div className="relative mb-8">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-success/30 bg-success/10 shadow-lg shadow-success/5">
          <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
        </div>
        <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-success/20 bg-success/15">
          <Zap className="h-3.5 w-3.5 text-success" />
        </div>
      </div>

      <h2 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
        You're all set
      </h2>

      <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground md:text-lg">
        <span className="text-foreground font-medium">{providerLabel}</span> is validated and
        the workspace is live. Start building.
      </p>

      <Separator className="my-8 max-w-xs" />

      {/* Quick tips */}
      <div className="grid w-full max-w-md gap-3 text-left">
        <div className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/40 px-4 py-3">
          <Terminal className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-sm text-muted-foreground">
            The shell is unlocked and ready for commands.
          </div>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-8 gap-2 px-10 text-base"
        onClick={onFinish}
        data-testid="onboarding-finish"
      >
        Launch workspace
        <Zap className="h-4 w-4" />
      </Button>
    </div>
  )
}
