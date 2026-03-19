"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  getOnboardingPresentation,
  type WorkspaceOnboardingProviderState,
  type WorkspaceOnboardingState,
  useGSDWorkspaceActions,
  useGSDWorkspaceState,
} from "@/lib/gsd-workspace-store"
import { useDevOverrides } from "@/lib/dev-overrides"
import { cn } from "@/lib/utils"

import { WizardStepper, type WizardStep } from "./onboarding/wizard-stepper"
import { StepWelcome } from "./onboarding/step-welcome"
import { StepProvider } from "./onboarding/step-provider"
import { StepAuthenticate } from "./onboarding/step-authenticate"
import { StepDevRoot } from "./onboarding/step-dev-root"
import { StepOptional } from "./onboarding/step-optional"
import { StepReady } from "./onboarding/step-ready"

// ─── Constants ──────────────────────────────────────────────────────

const WIZARD_STEPS: WizardStep[] = [
  { id: "welcome", label: "Welcome", shortLabel: "Welcome" },
  { id: "provider", label: "Provider", shortLabel: "Provider" },
  { id: "authenticate", label: "Authenticate", shortLabel: "Auth" },
  { id: "devRoot", label: "Dev Root", shortLabel: "Root" },
  { id: "optional", label: "Integrations", shortLabel: "Extras" },
  { id: "ready", label: "Ready", shortLabel: "Ready" },
]

// ─── Helpers ────────────────────────────────────────────────────────

function chooseDefaultProvider(providers: WorkspaceOnboardingProviderState[]): string | null {
  const unresolvedRecommended = providers.find((p) => !p.configured && p.recommended)
  if (unresolvedRecommended) return unresolvedRecommended.id

  const unresolved = providers.find((p) => !p.configured)
  if (unresolved) return unresolved.id

  return providers[0]?.id ?? null
}

// Slide animation variants keyed on direction
const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
    filter: "blur(4px)",
  }),
  center: {
    x: 0,
    opacity: 1,
    filter: "blur(0px)",
  },
  exit: (direction: number) => ({
    x: direction < 0 ? 80 : -80,
    opacity: 0,
    filter: "blur(4px)",
  }),
}

// ─── Main Component ─────────────────────────────────────────────────

export function OnboardingGate() {
  const workspace = useGSDWorkspaceState()
  const {
    refreshOnboarding,
    saveApiKey,
    startProviderFlow,
    submitProviderFlowInput,
    cancelProviderFlow,
    refreshBoot,
  } = useGSDWorkspaceActions()
  const devOverrides = useDevOverrides()

  const onboarding = workspace.boot?.onboarding
  const forceVisible = devOverrides.isActive("forceOnboarding")
  const presentation = getOnboardingPresentation(workspace)
  const isBusy = workspace.onboardingRequestState !== "idle"

  // ─── Wizard state ───
  const [stepIndex, setStepIndex] = useState(1)
  const [[page, direction], setPage] = useState([1, 0])
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [dismissedAfterSuccess, setDismissedAfterSuccess] = useState(false)

  // Sync selected provider from onboarding state
  useEffect(() => {
    const providers = onboarding?.required.providers ?? []
    if (providers.length === 0) return

    setSelectedProviderId((prev) => {
      if (onboarding?.activeFlow?.providerId) return onboarding.activeFlow.providerId
      if (prev && providers.some((p) => p.id === prev)) return prev
      return chooseDefaultProvider(providers)
    })
  }, [onboarding])

  // Auto-advance to ready when validation succeeds + bridge is done
  useEffect(() => {
    if (!onboarding) return
    const isUnlocked = !onboarding.locked
    const bridgeDone = onboarding.bridgeAuthRefresh.phase === "succeeded" || onboarding.bridgeAuthRefresh.phase === "idle"
    if (isUnlocked && bridgeDone && stepIndex === 2) {
      // Jump to optional or ready
      paginate(3)
    }
  }, [onboarding?.locked, onboarding?.bridgeAuthRefresh.phase])

  const selectedProvider = useMemo(() => {
    return onboarding?.required.providers.find((p) => p.id === selectedProviderId) ?? null
  }, [onboarding?.required.providers, selectedProviderId])

  const paginate = useCallback(
    (newIndex: number) => {
      setPage([newIndex, newIndex > stepIndex ? 1 : -1])
      setStepIndex(newIndex)
    },
    [stepIndex],
  )

  const progressPercent = useMemo(() => {
    return Math.round((stepIndex / (WIZARD_STEPS.length - 1)) * 100)
  }, [stepIndex])

  useEffect(() => {
    if (onboarding?.locked || isBusy) {
      setDismissedAfterSuccess(false)
    }
  }, [onboarding?.locked, isBusy])

  // ─── Gate check ───
  if (!onboarding) return null
  const onboardingSettled =
    !onboarding.locked ||
    (
      onboarding.lastValidation?.status === "succeeded" &&
      (onboarding.bridgeAuthRefresh.phase === "succeeded" || onboarding.bridgeAuthRefresh.phase === "idle")
    )
  if (!forceVisible && (onboardingSettled || (dismissedAfterSuccess && !isBusy))) return null

  // ─── Render ───
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-30 flex flex-col bg-background"
      data-testid="onboarding-gate"
    >
      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between border-b border-border/50 bg-background px-5 py-3 md:px-8">
        <div className="flex items-center gap-4">
          {/* Logo / brand */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-foreground/[0.06]">
              <span className="text-xs font-bold text-foreground">G</span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">Setup</span>
          </div>

          {/* Stepper — hidden on welcome/ready */}
          <div className={cn("hidden transition-opacity md:block", stepIndex === 0 || stepIndex === 5 ? "opacity-0" : "opacity-100")}>
            <WizardStepper
              steps={WIZARD_STEPS}
              currentIndex={stepIndex}
              onStepClick={(i) => {
                if (i <= stepIndex) paginate(i)
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground"
                onClick={() => void refreshOnboarding()}
                disabled={isBusy}
              >
                <RefreshCw
                  className={cn(
                    "h-3.5 w-3.5",
                    workspace.onboardingRequestState === "refreshing" && "animate-spin",
                  )}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reload setup state</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Progress bar */}
      <Progress value={progressPercent} className="h-0.5 rounded-none" />

      {/* Step content */}
      <ScrollArea className="flex-1">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-2xl flex-col justify-center px-5 py-10 md:px-8 md:py-16">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={stepIndex}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                x: { type: "spring", stiffness: 400, damping: 35 },
                opacity: { duration: 0.2 },
                filter: { duration: 0.2 },
              }}
            >
              {stepIndex === 0 && (
                <StepWelcome onNext={() => paginate(1)} />
              )}

              {stepIndex === 1 && (
                <StepProvider
                  providers={onboarding.required.providers}
                  selectedId={selectedProviderId}
                  onSelect={(id) => {
                    setSelectedProviderId(id)
                    paginate(2)
                  }}
                  onNext={() => paginate(2)}
                  onBack={() => paginate(0)}
                />
              )}

              {stepIndex === 2 && selectedProvider && (
                <StepAuthenticate
                  provider={selectedProvider}
                  activeFlow={onboarding.activeFlow}
                  lastValidation={onboarding.lastValidation}
                  requestState={workspace.onboardingRequestState}
                  requestProviderId={workspace.onboardingRequestProviderId}
                  onSaveApiKey={async (pid, key) => {
                    const next = await saveApiKey(pid, key)
                    const settled = Boolean(
                      next &&
                      !next.locked &&
                      (next.bridgeAuthRefresh.phase === "succeeded" || next.bridgeAuthRefresh.phase === "idle"),
                    )
                    if (settled) {
                      setDismissedAfterSuccess(true)
                      void refreshBoot()
                    }
                    return next
                  }}
                  onStartFlow={(pid) => void startProviderFlow(pid)}
                  onSubmitFlowInput={(fid, input) => void submitProviderFlowInput(fid, input)}
                  onCancelFlow={(fid) => void cancelProviderFlow(fid)}
                  onBack={() => paginate(1)}
                  onNext={() => paginate(3)}
                  bridgeRefreshPhase={onboarding.bridgeAuthRefresh.phase}
                  bridgeRefreshError={onboarding.bridgeAuthRefresh.error}
                />
              )}

              {stepIndex === 3 && (
                <StepDevRoot
                  onBack={() => paginate(2)}
                  onNext={() => paginate(4)}
                />
              )}

              {stepIndex === 4 && (
                <StepOptional
                  sections={onboarding.optional.sections}
                  onBack={() => paginate(3)}
                  onNext={() => paginate(5)}
                />
              )}

              {stepIndex === 5 && (
                <StepReady
                  providerLabel={
                    onboarding.lastValidation?.providerId
                      ? onboarding.required.providers.find(
                          (p) => p.id === onboarding.lastValidation?.providerId,
                        )?.label ?? "Provider"
                      : "Provider"
                  }
                  onFinish={() => void refreshBoot()}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Bottom bar — step indicator for mobile */}
      <footer className="flex items-center justify-center border-t border-border/50 bg-background px-5 py-3 md:hidden">
        <div className="flex items-center gap-2">
          {WIZARD_STEPS.map((step, i) => (
            <button
              key={step.id}
              type="button"
              onClick={() => {
                if (i <= stepIndex) paginate(i)
              }}
              disabled={i > stepIndex}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === stepIndex
                  ? "w-6 bg-foreground"
                  : i < stepIndex
                    ? "w-1.5 bg-foreground/50"
                    : "w-1.5 bg-border",
              )}
              aria-label={step.label}
            />
          ))}
        </div>
      </footer>
    </div>
  )
}
