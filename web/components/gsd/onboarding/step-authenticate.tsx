"use client"

import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import type {
  WorkspaceOnboardingFlowState,
  WorkspaceOnboardingProviderState,
  WorkspaceOnboardingRequestState,
  WorkspaceOnboardingState,
  WorkspaceOnboardingValidationResult,
} from "@/lib/gsd-workspace-store"

interface StepAuthenticateProps {
  provider: WorkspaceOnboardingProviderState
  activeFlow: WorkspaceOnboardingFlowState | null
  lastValidation: WorkspaceOnboardingValidationResult | null
  requestState: WorkspaceOnboardingRequestState
  requestProviderId: string | null
  onSaveApiKey: (providerId: string, apiKey: string) => Promise<WorkspaceOnboardingState | null>
  onStartFlow: (providerId: string) => void
  onSubmitFlowInput: (flowId: string, input: string) => void
  onCancelFlow: (flowId: string) => void
  onBack: () => void
  onNext: () => void
  bridgeRefreshPhase: "idle" | "pending" | "succeeded" | "failed"
  bridgeRefreshError: string | null
}

export function StepAuthenticate({
  provider,
  activeFlow,
  lastValidation,
  requestState,
  requestProviderId,
  onSaveApiKey,
  onStartFlow,
  onSubmitFlowInput,
  onCancelFlow,
  onBack,
  onNext,
  bridgeRefreshPhase,
  bridgeRefreshError,
}: StepAuthenticateProps) {
  const [apiKey, setApiKey] = useState("")
  const [flowInput, setFlowInput] = useState("")

  const isBusy = requestState !== "idle"
  const isThisProviderBusy = requestProviderId === provider.id && isBusy
  const isValidated = lastValidation?.status === "succeeded" && lastValidation.providerId === provider.id
  const isBridgeDone = bridgeRefreshPhase === "succeeded" || bridgeRefreshPhase === "idle"
  const canProceed = isValidated && isBridgeDone

  // Clear API key on successful validation
  useEffect(() => {
    if (lastValidation?.status === "succeeded") {
      setApiKey("")
    }
  }, [lastValidation?.checkedAt, lastValidation?.status])

  // Clear flow input when flow changes
  useEffect(() => {
    setFlowInput("")
  }, [activeFlow?.flowId])

  return (
    <div className="flex flex-col">
      <div className="mb-1">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Authenticate with {provider.label}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground md:text-base">
          {provider.supports.apiKey
            ? "Enter your API key below. It's validated before saving — nothing is persisted until the provider accepts it."
            : "This provider uses browser sign-in. Start the flow and follow the instructions."}
        </p>
      </div>

      {/* Validation banner */}
      {lastValidation && lastValidation.providerId === provider.id && (
        <div
          className={`mt-5 flex items-start gap-3 rounded-xl border px-4 py-3.5 text-sm ${
            lastValidation.status === "failed"
              ? "border-destructive/25 bg-destructive/10 text-destructive"
              : "border-success/25 bg-success/10 text-success"
          }`}
          data-testid="onboarding-validation-message"
        >
          {lastValidation.status === "failed" ? (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <div>
            <div className="font-medium">
              {lastValidation.status === "failed" ? "Validation failed" : "Credentials accepted"}
            </div>
            <div className="mt-0.5 text-muted-foreground">{lastValidation.message}</div>
          </div>
        </div>
      )}

      {/* Bridge refresh states */}
      {bridgeRefreshPhase === "pending" && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3.5 text-sm text-foreground/80">
            <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
            <span>Restarting the live bridge onto the new credentials…</span>
          </div>
          <Progress value={66} className="h-1" />
        </div>
      )}

      {bridgeRefreshPhase === "failed" && bridgeRefreshError && (
        <div className="mt-5 flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3.5 text-sm text-destructive">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Bridge could not reload credentials</div>
            <div className="mt-0.5 text-muted-foreground">{bridgeRefreshError}</div>
          </div>
        </div>
      )}

      {/* API key form */}
      {provider.supports.apiKey && !canProceed && (
        <Card className="mt-6 border-border/50 bg-card/40 shadow-none">
          <CardHeader className="gap-1 pb-4">
            <CardTitle className="text-base">API key</CardTitle>
            <CardDescription>Paste the key — it's sent server-side for validation only.</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()
                if (!apiKey.trim()) return
                const next = await onSaveApiKey(provider.id, apiKey)
                if (next && !next.locked && (next.bridgeAuthRefresh.phase === "succeeded" || next.bridgeAuthRefresh.phase === "idle")) {
                  onNext()
                }
              }}
            >
              <Field>
                <FieldLabel htmlFor="onboarding-api-key" className="sr-only">API key</FieldLabel>
                <FieldContent>
                  <Input
                    id="onboarding-api-key"
                    data-testid="onboarding-api-key-input"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={`Paste your ${provider.label} API key`}
                    disabled={isBusy}
                    className="font-mono text-sm"
                  />
                  <FieldDescription>
                    Never shown in responses. The browser only receives validation status.
                  </FieldDescription>
                </FieldContent>
              </Field>

              <div className="flex flex-wrap gap-3">
                <Button
                  type="submit"
                  disabled={!apiKey.trim() || isBusy}
                  className="gap-2"
                  data-testid="onboarding-save-api-key"
                >
                  {isThisProviderBusy && requestState === "saving_api_key" ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Validate & save
                </Button>

                {provider.supports.oauth && provider.supports.oauthAvailable && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => onStartFlow(provider.id)}
                    className="gap-2 text-muted-foreground"
                    data-testid="onboarding-start-provider-flow"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                    Browser sign-in instead
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* OAuth-only entry point */}
      {!provider.supports.apiKey && provider.supports.oauth && provider.supports.oauthAvailable && !canProceed && (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 text-sm text-muted-foreground">
            This provider authenticates through your browser. Start the flow and complete any steps that appear below.
          </div>
          <Button
            disabled={isBusy}
            onClick={() => onStartFlow(provider.id)}
            className="gap-2"
            data-testid="onboarding-start-provider-flow"
          >
            {isThisProviderBusy && requestState === "starting_provider_flow" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUpRight className="h-4 w-4" />
            )}
            Start browser sign-in
          </Button>
        </div>
      )}

      {/* OAuth unavailable notice */}
      {provider.supports.oauth && !provider.supports.oauthAvailable && !provider.supports.apiKey && (
        <div className="mt-6 rounded-xl border border-border/50 bg-card/40 px-4 py-3.5 text-sm text-muted-foreground">
          Browser sign-in is not available in this runtime. Go back and choose a provider with API-key support.
        </div>
      )}

      {/* Active OAuth flow */}
      {activeFlow && activeFlow.providerId === provider.id && !canProceed && (
        <Card className="mt-5 border-foreground/10 bg-foreground/[0.02] shadow-none" data-testid="onboarding-active-flow">
          <CardContent className="space-y-4 pt-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-foreground/15 text-foreground/70 capitalize">
                {activeFlow.status.replaceAll("_", " ")}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {new Date(activeFlow.updatedAt).toLocaleTimeString()}
              </span>
            </div>

            {activeFlow.auth?.instructions && (
              <p className="text-sm text-muted-foreground">{activeFlow.auth.instructions}</p>
            )}

            {activeFlow.auth?.url && (
              <Button asChild variant="outline" size="sm" className="gap-2" data-testid="onboarding-open-auth-url">
                <a href={activeFlow.auth.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open sign-in page
                </a>
              </Button>
            )}

            {activeFlow.progress.length > 0 && (
              <div className="space-y-2">
                <FieldTitle>Progress</FieldTitle>
                <div className="space-y-1.5">
                  {activeFlow.progress.map((message, index) => (
                    <div
                      key={`${activeFlow.flowId}-${index}`}
                      className="rounded-lg border border-border/40 bg-background/60 px-3 py-2 text-sm text-muted-foreground"
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeFlow.prompt && (
              <form
                className="space-y-3"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (!activeFlow.prompt?.allowEmpty && !flowInput.trim()) return
                  onSubmitFlowInput(activeFlow.flowId, flowInput)
                }}
              >
                <Separator />
                <Field>
                  <FieldLabel htmlFor="onboarding-flow-input">Next step</FieldLabel>
                  <FieldContent>
                    <Input
                      id="onboarding-flow-input"
                      data-testid="onboarding-flow-input"
                      value={flowInput}
                      onChange={(event) => setFlowInput(event.target.value)}
                      placeholder={activeFlow.prompt.placeholder || "Enter the requested value"}
                      disabled={isBusy}
                    />
                    <FieldDescription>{activeFlow.prompt.message}</FieldDescription>
                  </FieldContent>
                </Field>

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    disabled={isBusy || (!activeFlow.prompt.allowEmpty && !flowInput.trim())}
                    className="gap-2"
                  >
                    {requestState === "submitting_provider_flow_input" ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Continue
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isBusy}
                    onClick={() => onCancelFlow(activeFlow.flowId)}
                    className="text-muted-foreground"
                  >
                    Cancel flow
                  </Button>
                </div>
              </form>
            )}

            {activeFlow.status === "running" && !activeFlow.prompt && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Waiting for the next step…
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success state */}
      {canProceed && (
        <div className="mt-6 flex flex-col items-center gap-4 rounded-xl border border-success/20 bg-success/[0.06] px-6 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-success/30 bg-success/20">
            <ShieldCheck className="h-6 w-6 text-success" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">{provider.label} is ready</div>
            <div className="mt-1 text-sm text-muted-foreground">Credentials validated and saved. Continue to the next step.</div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="text-muted-foreground">
          Back
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="gap-2"
          data-testid="onboarding-auth-continue"
        >
          Continue
          <Sparkles className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
