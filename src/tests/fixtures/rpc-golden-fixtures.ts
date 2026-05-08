// Project/App: GSD-2
// File Purpose: Shared RPC protocol fixture records for Phase 0 characterization and Phase 1 contracts work.

export const rpcGoldenCommands = [
  { id: "cmd-init", type: "init", protocolVersion: 2, clientId: "phase-0-fixture" },
  { id: "cmd-state", type: "get_state" },
  { id: "cmd-bash", type: "bash", command: "printf ok" },
  { id: "cmd-thinking", type: "set_thinking_level", level: "xhigh" },
  { id: "cmd-stats", type: "get_session_stats" },
  { id: "cmd-prompt", type: "prompt", message: "Summarize current status", streamingBehavior: "followUp" },
] as const;

export const rpcGoldenResponses = [
  {
    id: "cmd-init",
    type: "response",
    command: "init",
    success: true,
    data: {
      protocolVersion: 2,
      sessionId: "session-fixture",
      capabilities: {
        events: ["execution_complete", "cost_update"],
        commands: ["init", "get_state", "bash", "set_thinking_level", "get_session_stats", "prompt"],
      },
    },
  },
  {
    id: "cmd-state",
    type: "response",
    command: "get_state",
    success: true,
    data: {
      model: { provider: "fixture-provider", id: "fixture-model", contextWindow: 200000 },
      thinkingLevel: "xhigh",
      isStreaming: false,
      isCompacting: false,
      steeringMode: "all",
      followUpMode: "one-at-a-time",
      sessionFile: "/tmp/gsd/session.json",
      sessionId: "session-fixture",
      sessionName: "Phase 0 Fixture",
      autoCompactionEnabled: true,
      autoRetryEnabled: true,
      retryInProgress: false,
      retryAttempt: 0,
      messageCount: 4,
      pendingMessageCount: 0,
      extensionsReady: true,
    },
  },
  {
    id: "cmd-bash",
    type: "response",
    command: "bash",
    success: true,
    data: {
      output: "ok",
      exitCode: 0,
      cancelled: false,
      truncated: false,
    },
  },
  {
    id: "cmd-stats",
    type: "response",
    command: "get_session_stats",
    success: true,
    data: {
      sessionFile: "/tmp/gsd/session.json",
      sessionId: "session-fixture",
      userMessages: 2,
      assistantMessages: 2,
      toolCalls: 1,
      toolResults: 1,
      totalMessages: 4,
      tokens: {
        input: 1000,
        output: 400,
        cacheRead: 200,
        cacheWrite: 50,
        total: 1650,
      },
      cost: 0.05,
    },
  },
] as const;

export const rpcGoldenEvents = [
  {
    type: "execution_complete",
    runId: "run-fixture",
    status: "completed",
    stats: rpcGoldenResponses[3].data,
  },
  {
    type: "cost_update",
    runId: "run-fixture",
    turnCost: 0.01,
    cumulativeCost: 0.05,
    tokens: {
      input: 1000,
      output: 400,
      cacheRead: 200,
      cacheWrite: 50,
    },
  },
] as const;

export const rpcGoldenRecords = [
  ...rpcGoldenCommands,
  ...rpcGoldenResponses,
  ...rpcGoldenEvents,
] as const;
