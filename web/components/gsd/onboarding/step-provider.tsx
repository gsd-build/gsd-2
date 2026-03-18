"use client"

import { ArrowRight, Check, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { WorkspaceOnboardingProviderState } from "@/lib/gsd-workspace-store"
import { cn } from "@/lib/utils"

interface StepProviderProps {
  providers: WorkspaceOnboardingProviderState[]
  selectedId: string | null
  onSelect: (id: string) => void
  onNext: () => void
  onBack: () => void
}

function capabilityBadges(provider: WorkspaceOnboardingProviderState): string[] {
  const badges: string[] = []
  if (provider.supports.apiKey) badges.push("API key")
  if (provider.supports.oauth) badges.push(provider.supports.oauthAvailable ? "Browser sign-in" : "OAuth unavailable")
  return badges
}

function configuredViaLabel(source: WorkspaceOnboardingProviderState["configuredVia"]): string {
  switch (source) {
    case "auth_file": return "Saved auth"
    case "environment": return "Environment variable"
    case "runtime": return "Runtime"
    default: return "Not configured"
  }
}

export function StepProvider({ providers, selectedId, onSelect, onNext, onBack }: StepProviderProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Choose a provider
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
          One validated provider unlocks the workspace. Pick the one you want to authenticate.
        </p>
      </div>

      <ScrollArea className="mt-6 max-h-[50vh] pr-1">
        <div className="grid gap-3 sm:grid-cols-2">
          {providers.map((provider) => {
            const selected = provider.id === selectedId

            return (
              <button
                key={provider.id}
                type="button"
                onClick={() => onSelect(provider.id)}
                className={cn(
                  "group relative rounded-xl border px-4 py-4 text-left transition-all duration-200",
                  selected
                    ? "border-foreground/40 bg-foreground/[0.06] shadow-sm ring-1 ring-foreground/10"
                    : "border-border/60 bg-card/40 hover:border-foreground/20 hover:bg-card/70",
                )}
                data-testid={`onboarding-provider-${provider.id}`}
              >
                {/* Selection indicator */}
                <div
                  className={cn(
                    "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full border transition-all duration-200",
                    selected
                      ? "border-foreground bg-foreground text-background"
                      : "border-border/80 bg-transparent",
                  )}
                >
                  {selected && <Check className="h-3 w-3" strokeWidth={3} />}
                </div>

                {/* Provider name + badges */}
                <div className="pr-8">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{provider.label}</span>
                    {provider.recommended && (
                      <Badge variant="outline" className="border-foreground/20 bg-foreground/[0.06] text-xs text-foreground/80">
                        Recommended
                      </Badge>
                    )}
                  </div>

                  {/* Status line */}
                  <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                    {provider.configured ? (
                      <>
                        <ShieldCheck className="h-3 w-3 text-success/80" />
                        <span>{configuredViaLabel(provider.configuredVia)}</span>
                      </>
                    ) : (
                      <span>Not configured yet</span>
                    )}
                  </div>
                </div>

                {/* Capabilities */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {capabilityBadges(provider).map((cap) => (
                    <Tooltip key={cap}>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="border-border/60 bg-background/50 text-[11px] text-muted-foreground"
                        >
                          {cap}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {cap === "API key"
                          ? "Enter an API key to authenticate"
                          : cap === "Browser sign-in"
                            ? "Authenticate through your browser"
                            : "This auth method is not available in this runtime"}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!selectedId}
          className="gap-2"
          data-testid="onboarding-provider-continue"
        >
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
