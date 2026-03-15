"use client"

import { useEffect, useMemo, useState } from "react"
import {
  ArrowUpRight,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  getOnboardingPresentation,
  type WorkspaceOnboardingOptionalSectionState,
  type WorkspaceOnboardingProviderState,
  type WorkspaceOnboardingState,
  useGSDWorkspaceActions,
  useGSDWorkspaceState,
} from "@/lib/gsd-workspace-store"
import { cn } from "@/lib/utils"

function chooseDefaultProvider(providers: WorkspaceOnboardingProviderState[]): string | null {
  const unresolvedRecommended = providers.find((provider) => !provider.configured && provider.recommended)
  if (unresolvedRecommended) return unresolvedRecommended.id

  const unresolved = providers.find((provider) => !provider.configured)
  if (unresolved) return unresolved.id

  return providers[0]?.id ?? null
}

function configuredViaLabel(source: WorkspaceOnboardingProviderState["configuredVia"]): string {
  switch (source) {
    case "auth_file":
      return "saved auth"
    case "environment":
      return "environment"
    case "runtime":
      return "runtime"
    default:
      return "not configured"
  }
}

function lockReasonCopy(lockReason: WorkspaceOnboardingState["lockReason"]): { eyebrow: string; detail: string } {
  switch (lockReason) {
    case "bridge_refresh_pending":
      return {
        eyebrow: "Refreshing live auth",
        detail: "Credentials validated. The workspace is waiting for the live bridge to restart onto the new auth view.",
      }
    case "bridge_refresh_failed":
      return {
        eyebrow: "Bridge refresh failed",
        detail: "Setup succeeded, but the live bridge could not reload auth. The shell stays locked until that retry succeeds.",
      }
    case "required_setup":
    default:
      return {
        eyebrow: "Required setup",
        detail: "A model provider must validate here before prompts, new sessions, or other mutating commands are allowed.",
      }
  }
}

function optionalSectionSummary(section: WorkspaceOnboardingOptionalSectionState): string {
  if (section.configuredItems.length === 0) return "Skip for now — nothing here blocks the workspace."
  return `Configured: ${section.configuredItems.join(", ")}`
}

function capabilityBadges(provider: WorkspaceOnboardingProviderState): string[] {
  const badges: string[] = []
  if (provider.supports.apiKey) badges.push("API key")
  if (provider.supports.oauth) badges.push(provider.supports.oauthAvailable ? "Browser sign-in" : "OAuth unavailable")
  return badges
}

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

  const onboarding = workspace.boot?.onboarding
  const presentation = getOnboardingPresentation(workspace)
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [flowInput, setFlowInput] = useState("")

  useEffect(() => {
    const providers = onboarding?.required.providers ?? []
    if (providers.length === 0) return

    setSelectedProviderId((previous) => {
      if (onboarding?.activeFlow?.providerId) {
        return onboarding.activeFlow.providerId
      }
      if (previous && providers.some((provider) => provider.id === previous)) {
        return previous
      }
      return chooseDefaultProvider(providers)
    })
  }, [onboarding])

  useEffect(() => {
    if (onboarding?.lastValidation?.status === "succeeded") {
      setApiKey("")
    }
  }, [onboarding?.lastValidation?.checkedAt, onboarding?.lastValidation?.status])

  useEffect(() => {
    setFlowInput("")
  }, [onboarding?.activeFlow?.flowId])

  const selectedProvider = useMemo(() => {
    return onboarding?.required.providers.find((provider) => provider.id === selectedProviderId) ?? null
  }, [onboarding?.required.providers, selectedProviderId])

  const activeFlow = onboarding?.activeFlow ?? null
  const isBusy = workspace.onboardingRequestState !== "idle"
  const gateCopy = onboarding?.locked
    ? lockReasonCopy(onboarding.lockReason)
    : { eyebrow: presentation.label, detail: presentation.detail }
  const isSelectedProviderBusy =
    Boolean(selectedProvider?.id) &&
    workspace.onboardingRequestProviderId === selectedProvider?.id &&
    workspace.onboardingRequestState !== "idle"

  if (!onboarding || (!onboarding.locked && !isBusy)) return null

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex bg-background/82 backdrop-blur-md" data-testid="onboarding-gate">
      <div className="flex flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center p-5 md:p-8 xl:p-10">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(24rem,0.85fr)]">
            <Card className="border-border/70 bg-card/95 shadow-2xl shadow-black/10">
              <CardHeader className="gap-4 border-b border-border/70 pb-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-3">
                    <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-200">
                      <LockKeyhole className="h-3 w-3" />
                      {gateCopy.eyebrow}
                    </Badge>
                    <div className="space-y-2">
                      <CardTitle className="text-2xl tracking-tight md:text-3xl">{presentation.label}</CardTitle>
                      <CardDescription className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-[15px]">
                        {presentation.detail}
                      </CardDescription>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-border/70 bg-background/70"
                      onClick={() => void refreshOnboarding()}
                      disabled={isBusy}
                      data-testid="onboarding-refresh-status"
                    >
                      <RefreshCw className={cn("h-3.5 w-3.5", workspace.onboardingRequestState === "refreshing" && "animate-spin")} />
                      Reload setup state
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => void refreshBoot()}
                      disabled={isBusy}
                    >
                      Refresh workspace
                    </Button>
                  </div>
                </div>

                <div
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm",
                    presentation.tone === "danger"
                      ? "border-destructive/30 bg-destructive/10 text-destructive"
                      : presentation.tone === "warning"
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        : "border-foreground/10 bg-background/70 text-foreground/90",
                  )}
                  data-testid="onboarding-gate-phase"
                >
                  <div className="font-medium">{gateCopy.detail}</div>
                </div>
              </CardHeader>

              <CardContent className="space-y-5 pt-6">
                {onboarding.lastValidation && (
                  <div
                    className={cn(
                      "rounded-xl border px-4 py-3 text-sm",
                      onboarding.lastValidation.status === "failed"
                        ? "border-destructive/25 bg-destructive/10 text-destructive"
                        : "border-success/25 bg-success/10 text-success",
                    )}
                    data-testid="onboarding-validation-message"
                  >
                    <div className="flex items-start gap-3">
                      {onboarding.lastValidation.status === "failed" ? (
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      ) : (
                        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                      )}
                      <div className="space-y-1">
                        <div className="font-medium">
                          {onboarding.lastValidation.status === "failed" ? "Validation failed" : "Validation succeeded"}
                        </div>
                        <div>{onboarding.lastValidation.message}</div>
                      </div>
                    </div>
                  </div>
                )}

                {onboarding.bridgeAuthRefresh.phase === "failed" && onboarding.bridgeAuthRefresh.error && (
                  <div className="rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                    <div className="flex items-start gap-3">
                      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <div className="space-y-1">
                        <div className="font-medium">The live bridge did not pick up the new auth view</div>
                        <div>{onboarding.bridgeAuthRefresh.error}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Required providers
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      One successful provider is enough to unlock the workspace. Recommended choices are listed first.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {onboarding.required.providers.map((provider) => {
                      const selected = provider.id === selectedProvider?.id
                      return (
                        <button
                          key={provider.id}
                          type="button"
                          onClick={() => setSelectedProviderId(provider.id)}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition-all",
                            selected
                              ? "border-foreground/40 bg-foreground/[0.045] shadow-sm"
                              : "border-border/70 bg-background/65 hover:border-foreground/20 hover:bg-accent/40",
                          )}
                          data-testid={`onboarding-provider-${provider.id}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-medium text-foreground">{provider.label}</div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {provider.configured ? `Detected via ${configuredViaLabel(provider.configuredVia)}` : "Not configured yet"}
                              </div>
                            </div>
                            <div className="flex flex-wrap justify-end gap-1">
                              {provider.recommended && <Badge className="bg-foreground text-background">Recommended</Badge>}
                              {provider.configured && <Badge variant="outline">Detected</Badge>}
                            </div>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {capabilityBadges(provider).map((entry) => (
                              <Badge key={entry} variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                                {entry}
                              </Badge>
                            ))}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {selectedProvider && (
                  <Card className="border-border/70 bg-background/80 shadow-none">
                    <CardHeader className="gap-2 pb-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <CardTitle className="text-lg">{selectedProvider.label}</CardTitle>
                          <CardDescription>
                            {selectedProvider.supports.apiKey
                              ? "Validate the key here. It is only persisted after the provider accepts it."
                              : "This provider uses browser sign-in instead of an API key."}
                          </CardDescription>
                        </div>
                        <Badge variant="outline" className="border-border/70 bg-background/70 text-muted-foreground">
                          {configuredViaLabel(selectedProvider.configuredVia)}
                        </Badge>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-5">
                      {selectedProvider.supports.apiKey && (
                        <form
                          className="space-y-4"
                          onSubmit={(event) => {
                            event.preventDefault()
                            if (!apiKey.trim()) return
                            void saveApiKey(selectedProvider.id, apiKey)
                          }}
                        >
                          <FieldGroup>
                            <Field>
                              <FieldLabel htmlFor="onboarding-api-key">API key</FieldLabel>
                              <FieldContent>
                                <Input
                                  id="onboarding-api-key"
                                  data-testid="onboarding-api-key-input"
                                  type="password"
                                  autoComplete="off"
                                  value={apiKey}
                                  onChange={(event) => setApiKey(event.target.value)}
                                  placeholder="Paste a provider key"
                                  disabled={isBusy}
                                />
                                <FieldDescription>
                                  The key never appears in responses. The browser only receives validation status, timestamps, and redacted failures.
                                </FieldDescription>
                              </FieldContent>
                            </Field>
                          </FieldGroup>

                          <div className="flex flex-wrap gap-3">
                            <Button
                              type="submit"
                              disabled={!apiKey.trim() || isBusy}
                              data-testid="onboarding-save-api-key"
                            >
                              {isSelectedProviderBusy && workspace.onboardingRequestState === "saving_api_key" ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <KeyRound className="h-4 w-4" />
                              )}
                              Validate and save
                            </Button>

                            {selectedProvider.supports.oauth && selectedProvider.supports.oauthAvailable && (
                              <Button
                                type="button"
                                variant="outline"
                                disabled={isBusy}
                                onClick={() => void startProviderFlow(selectedProvider.id)}
                                data-testid="onboarding-start-provider-flow"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                                Use browser sign-in instead
                              </Button>
                            )}
                          </div>
                        </form>
                      )}

                      {!selectedProvider.supports.apiKey && selectedProvider.supports.oauth && selectedProvider.supports.oauthAvailable && (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                            This provider unlocks through browser sign-in. Start the flow here and complete any follow-up step that appears below.
                          </div>
                          <Button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void startProviderFlow(selectedProvider.id)}
                            data-testid="onboarding-start-provider-flow"
                          >
                            {isSelectedProviderBusy && workspace.onboardingRequestState === "starting_provider_flow" ? (
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4" />
                            )}
                            Start browser sign-in
                          </Button>
                        </div>
                      )}

                      {selectedProvider.supports.oauth && !selectedProvider.supports.oauthAvailable && (
                        <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                          Browser sign-in for this provider is not available in the current runtime. Choose a provider with API-key setup or another available sign-in flow.
                        </div>
                      )}

                      {activeFlow && activeFlow.providerId === selectedProvider.id && (
                        <div className="space-y-4 rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-4" data-testid="onboarding-active-flow">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="border-foreground/15 bg-background/80 text-foreground/80">
                              {activeFlow.status.replaceAll("_", " ")}
                            </Badge>
                            <span className="text-sm text-muted-foreground">Updated {new Date(activeFlow.updatedAt).toLocaleTimeString()}</span>
                          </div>

                          {activeFlow.auth?.instructions && (
                            <div className="text-sm text-muted-foreground">{activeFlow.auth.instructions}</div>
                          )}

                          {activeFlow.auth?.url && (
                            <Button asChild variant="outline" size="sm" data-testid="onboarding-open-auth-url">
                              <a href={activeFlow.auth.url} target="_blank" rel="noreferrer">
                                <ExternalLink className="h-4 w-4" />
                                Open sign-in page
                              </a>
                            </Button>
                          )}

                          {activeFlow.progress.length > 0 && (
                            <div className="space-y-2">
                              <FieldTitle>Flow progress</FieldTitle>
                              <div className="space-y-2 text-sm text-muted-foreground">
                                {activeFlow.progress.map((message, index) => (
                                  <div key={`${activeFlow.flowId}-${index}`} className="rounded-lg border border-border/50 bg-background/70 px-3 py-2">
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
                                void submitProviderFlowInput(activeFlow.flowId, flowInput)
                              }}
                            >
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
                                <Button type="submit" disabled={isBusy || (!activeFlow.prompt.allowEmpty && !flowInput.trim())}>
                                  {workspace.onboardingRequestState === "submitting_provider_flow_input" ? (
                                    <LoaderCircle className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Sparkles className="h-4 w-4" />
                                  )}
                                  Continue sign-in
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => void cancelProviderFlow(activeFlow.flowId)}
                                >
                                  Cancel flow
                                </Button>
                              </div>
                            </form>
                          )}

                          {activeFlow.status === "running" && !activeFlow.prompt && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <LoaderCircle className="h-4 w-4 animate-spin" />
                              Waiting for the provider flow to reach the next step…
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/5">
                <CardHeader className="gap-2">
                  <CardTitle className="text-lg">What stays locked</CardTitle>
                  <CardDescription>
                    Read-only project state still loads, but the live workspace stays blocked until setup clears.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    Prompts, follow-ups, and new-session commands are rejected while onboarding is locked.
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    Validation failures stay visible here and the shell remains blocked until a provider validates cleanly.
                  </div>
                  <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
                    Successful setup restarts the live bridge onto the new auth view so the first command works without a host restart.
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-card/95 shadow-xl shadow-black/5">
                <CardHeader className="gap-2">
                  <CardTitle className="text-lg">Optional integrations</CardTitle>
                  <CardDescription>
                    These stay skippable. They improve tools, not access to the workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {onboarding.optional.sections.map((section) => (
                    <div
                      key={section.id}
                      className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3"
                      data-testid={`onboarding-optional-${section.id}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-foreground">{section.label}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{optionalSectionSummary(section)}</div>
                        </div>
                        <Badge variant="outline" className="border-border/70 bg-background/80 text-muted-foreground">
                          {section.configured ? "Configured" : "Skip for now"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
