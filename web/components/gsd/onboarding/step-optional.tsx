"use client"

import { ArrowRight, Check, CircleDashed } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { WorkspaceOnboardingOptionalSectionState } from "@/lib/gsd-workspace-store"
import { cn } from "@/lib/utils"

interface StepOptionalProps {
  sections: WorkspaceOnboardingOptionalSectionState[]
  onBack: () => void
  onNext: () => void
}

export function StepOptional({ sections, onBack, onNext }: StepOptionalProps) {
  const configuredCount = sections.filter((s) => s.configured).length

  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Optional integrations
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
          These improve tools and capabilities but nothing here blocks the workspace.
          You can configure them later from settings.
        </p>
      </div>

      {configuredCount > 0 && (
        <div className="mt-4">
          <Badge variant="outline" className="border-success/20 bg-success/[0.06] text-success">
            {configuredCount} of {sections.length} configured
          </Badge>
        </div>
      )}

      <Separator className="mt-5 mb-1" />

      <div className="mt-5 space-y-3">
        {sections.map((section) => (
          <div
            key={section.id}
            className={cn(
              "flex items-start gap-4 rounded-xl border px-4 py-4 transition-colors",
              section.configured
                ? "border-success/15 bg-success/[0.04]"
                : "border-border/50 bg-card/40",
            )}
            data-testid={`onboarding-optional-${section.id}`}
          >
            {/* Status icon */}
            <div
              className={cn(
                "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                section.configured
                  ? "bg-success/20 text-success"
                  : "bg-foreground/[0.06] text-muted-foreground",
              )}
            >
              {section.configured ? (
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              ) : (
                <CircleDashed className="h-3.5 w-3.5" />
              )}
            </div>

            <div className="flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{section.label}</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px]",
                        section.configured
                          ? "border-success/20 text-success/80"
                          : "border-border/60 text-muted-foreground",
                      )}
                    >
                      {section.configured ? "Ready" : "Skipped"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {section.configured
                      ? "This integration is configured and active"
                      : "You can set this up later from workspace settings"}
                  </TooltipContent>
                </Tooltip>
              </div>

              {section.configuredItems.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {section.configuredItems.map((item) => (
                    <Badge
                      key={item}
                      variant="outline"
                      className="border-border/50 bg-background/40 text-[11px] text-muted-foreground"
                    >
                      {item}
                    </Badge>
                  ))}
                </div>
              )}

              {section.configuredItems.length === 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Nothing configured — skip for now, add later.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          Back
        </Button>
        <Button onClick={onNext} className="gap-2" data-testid="onboarding-optional-continue">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
