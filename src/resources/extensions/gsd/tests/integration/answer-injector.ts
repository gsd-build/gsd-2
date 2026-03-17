/**
 * Answer Injection Middleware — caller-side interceptor for headless sessions.
 *
 * Wraps the RPC event handler to intercept `ask_user_questions` and
 * `secure_env_collect` tool calls, providing pre-supplied answers from
 * a JSON answer file instead of requiring TUI interaction.
 *
 * Two-phase correlation strategy with deferred processing:
 *   1. Observe `tool_execution_start` events to extract question metadata
 *      (IDs, headers, options, allowMultiple) or secret key names.
 *   2. Match subsequent `extension_ui_request` events to the queued metadata
 *      and respond with the correct answer from the answer file.
 *
 * IMPORTANT: In RPC mode, `extension_ui_request` can arrive BEFORE the
 * corresponding `tool_execution_start` due to async event queue processing.
 * The injector handles this by buffering select/input events that arrive
 * without metadata and processing them when the metadata arrives.
 *
 * Fire-and-forget events (notify, setStatus, etc.) are silently consumed.
 * Secret values are never logged — only key names and match status.
 */

import type { AnswerFile } from "./answer-schema.js";

// ── Types ────────────────────────────────────────────────────────────────────

/** Metadata extracted from a single question in ask_user_questions args */
interface QuestionMeta {
  id: string;
  header: string;
  question: string;
  options: Array<{ label: string; description?: string }>;
  allowMultiple?: boolean;
}

/** Metadata for a pending secure_env_collect key */
interface SecretKeyMeta {
  key: string;
  hint?: string;
}

/** Stats for diagnostics */
export interface InjectorStats {
  questionsAnswered: number;
  questionsDefaulted: number;
  secretsProvided: number;
  secretsMissing: number;
  fireAndForgetConsumed: number;
  confirmationsHandled: number;
}

/** Buffered event waiting for metadata */
interface DeferredEvent {
  event: ExtensionUIRequest;
  respond: (payload: string) => void;
  kind: "select" | "input";
}

/** NDJSON serialization helper */
function serializeJsonLine(obj: Record<string, unknown>): string {
  return JSON.stringify(obj) + "\n";
}

/** Extension UI request shape (mirrors rpc-types but local to avoid import) */
interface ExtensionUIRequest {
  type: "extension_ui_request";
  id: string;
  method: string;
  title?: string;
  options?: string[];
  message?: string;
  timeout?: number;
  allowMultiple?: boolean;
  [key: string]: unknown;
}

// ── Fire-and-forget methods ──────────────────────────────────────────────────

const FIRE_AND_FORGET_METHODS = new Set([
  "notify",
  "setStatus",
  "setWidget",
  "setTitle",
  "set_editor_text",
]);

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an answer injection middleware.
 *
 * Returns an object with:
 * - `handleEvent(event, respond)` — process an RPC event. Call `respond(payload)`
 *   to write the response back to the child process stdin.
 * - `getStats()` — structured diagnostics summary.
 *
 * The `respond` callback receives the serialized NDJSON line to write.
 * This keeps the injector transport-agnostic (per D012).
 */
export function createAnswerInjector(answerFile: AnswerFile) {
  // Queues for correlating tool_execution_start with extension_ui_request
  const pendingQuestions: QuestionMeta[][] = [];  // outer = per tool call, inner = questions in that call
  const pendingSecretKeys: SecretKeyMeta[][] = []; // outer = per tool call, inner = keys in that call

  // Current active batch being drained (FIFO)
  let activeQuestionBatch: QuestionMeta[] = [];
  let activeSecretBatch: SecretKeyMeta[] = [];

  // Deferred events: select/input events that arrived before their tool_execution_start
  const deferredSelectEvents: DeferredEvent[] = [];
  const deferredInputEvents: DeferredEvent[] = [];

  const stats: InjectorStats = {
    questionsAnswered: 0,
    questionsDefaulted: 0,
    secretsProvided: 0,
    secretsMissing: 0,
    fireAndForgetConsumed: 0,
    confirmationsHandled: 0,
  };

  function advanceQuestionBatch() {
    if (activeQuestionBatch.length === 0 && pendingQuestions.length > 0) {
      activeQuestionBatch = pendingQuestions.shift()!;
    }
  }

  function advanceSecretBatch() {
    if (activeSecretBatch.length === 0 && pendingSecretKeys.length > 0) {
      activeSecretBatch = pendingSecretKeys.shift()!;
    }
  }

  /** Process a select event with available metadata */
  function processSelect(
    req: ExtensionUIRequest,
    meta: QuestionMeta | undefined,
    respond: (payload: string) => void,
  ): void {
    const { id } = req;
    const questionId = meta?.id ?? "";
    const answer = questionId ? answerFile.questions[questionId] : undefined;

    if (answer !== undefined) {
      // Matched answer from file
      if (meta?.allowMultiple && Array.isArray(answer)) {
        // Multi-select: respond with values array
        console.log(`  [ANSWER] question="${questionId}" values=${JSON.stringify(answer)} (matched)`);
        stats.questionsAnswered++;
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          values: answer,
        }));
      } else {
        // Single-select: respond with value string
        const value = Array.isArray(answer) ? answer[0] ?? "" : answer;
        console.log(`  [ANSWER] question="${questionId}" value="${value}" (matched)`);
        stats.questionsAnswered++;
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value,
        }));
      }
      return;
    }

    // No answer in file — apply default strategy
    if (answerFile.defaults.strategy === "first_option") {
      const firstOption = req.options?.[0] ?? "";
      console.log(`  [DEFAULT] question="${questionId}" value="${firstOption}" (first_option fallback)`);
      stats.questionsDefaulted++;

      if (meta?.allowMultiple) {
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          values: [firstOption],
        }));
      } else {
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value: firstOption,
        }));
      }
      return;
    }

    // cancel strategy
    console.log(`  [DEFAULT] question="${questionId}" (cancelled — no answer, cancel strategy)`);
    stats.questionsDefaulted++;
    respond(serializeJsonLine({
      type: "extension_ui_response",
      id,
      cancelled: true,
    }));
  }

  /** Process an input event with available metadata */
  function processInput(
    req: ExtensionUIRequest,
    secretMeta: SecretKeyMeta | undefined,
    respond: (payload: string) => void,
  ): void {
    const { id } = req;

    if (secretMeta) {
      const keyName = secretMeta.key;
      const secretValue = answerFile.secrets[keyName];
      if (secretValue !== undefined) {
        // Never log the value — key name only
        console.log(`  [SECRET] key="${keyName}" (matched)`);
        stats.secretsProvided++;
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value: secretValue,
        }));
      } else {
        console.warn(`  [SECRET] key="${keyName}" (NOT FOUND in answer file — sending empty)`);
        stats.secretsMissing++;
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value: "",
        }));
      }
      return;
    }

    // No secret metadata — generic input, respond with empty
    console.log(`  [INPUT] title="${req.title ?? ""}" (no matching secret — sending empty)`);
    respond(serializeJsonLine({
      type: "extension_ui_response",
      id,
      value: "",
    }));
  }

  /** Drain deferred events now that metadata is available */
  function drainDeferredEvents(): void {
    // Process deferred select events
    while (deferredSelectEvents.length > 0) {
      advanceQuestionBatch();
      if (activeQuestionBatch.length === 0) break; // No more metadata available
      const deferred = deferredSelectEvents.shift()!;
      const meta = activeQuestionBatch.shift();
      processSelect(deferred.event, meta, deferred.respond);
    }

    // Process deferred input events
    while (deferredInputEvents.length > 0) {
      advanceSecretBatch();
      if (activeSecretBatch.length === 0) break;
      const deferred = deferredInputEvents.shift()!;
      const secretMeta = activeSecretBatch.shift();
      processInput(deferred.event, secretMeta, deferred.respond);
    }
  }

  /**
   * Handle a single RPC event. Returns true if the event was consumed
   * (i.e., a response was sent or it was fire-and-forget), false otherwise.
   */
  function handleEvent(
    event: Record<string, unknown>,
    respond: (payload: string) => void,
  ): boolean {
    const type = event.type as string;

    // ── Phase 1: Observe tool_execution_start to extract metadata ────────
    if (type === "tool_execution_start") {
      const toolName = event.toolName as string;

      if (toolName === "ask_user_questions") {
        const args = event.args as Record<string, unknown> | undefined;
        const questions = (args?.questions ?? []) as Array<Record<string, unknown>>;

        const batch: QuestionMeta[] = questions.map((q) => ({
          id: String(q.id ?? ""),
          header: String(q.header ?? ""),
          question: String(q.question ?? ""),
          options: Array.isArray(q.options)
            ? (q.options as Array<Record<string, unknown>>).map((o) => ({
                label: String(o.label ?? ""),
                description: o.description ? String(o.description) : undefined,
              }))
            : [],
          allowMultiple: q.allowMultiple === true,
        }));

        pendingQuestions.push(batch);

        // Drain any deferred select events that were waiting for this metadata
        drainDeferredEvents();

        return false; // Don't consume — other handlers may also want this event
      }

      if (toolName === "secure_env_collect") {
        const args = event.args as Record<string, unknown> | undefined;
        const keys = (args?.keys ?? []) as Array<Record<string, unknown>>;

        const batch: SecretKeyMeta[] = keys.map((k) => ({
          key: String(k.key ?? ""),
          hint: k.hint ? String(k.hint) : undefined,
        }));

        pendingSecretKeys.push(batch);

        // Drain any deferred input events that were waiting for this metadata
        drainDeferredEvents();

        return false;
      }

      return false;
    }

    // ── Phase 2: Respond to extension_ui_request events ──────────────────
    if (type === "extension_ui_request") {
      const req = event as unknown as ExtensionUIRequest;
      const { id, method } = req;

      // Fire-and-forget: silently consume
      if (FIRE_AND_FORGET_METHODS.has(method)) {
        stats.fireAndForgetConsumed++;
        // No response needed — these are one-way in RPC mode.
        // But S02 showed that sending a response is harmless and may be expected.
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value: "",
        }));
        return true;
      }

      // Confirm: auto-confirm
      if (method === "confirm") {
        stats.confirmationsHandled++;
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          confirmed: true,
        }));
        return true;
      }

      // Select: match to queued question metadata
      if (method === "select") {
        advanceQuestionBatch();

        if (activeQuestionBatch.length > 0) {
          // Metadata available — process immediately
          const meta = activeQuestionBatch.shift();
          processSelect(req, meta, respond);
        } else {
          // No metadata yet — defer until tool_execution_start arrives.
          // This happens because extension_ui_request can arrive before
          // tool_execution_start due to async event queue processing in RPC mode.
          console.log(`  [DEFER] select event buffered — waiting for tool_execution_start metadata`);
          deferredSelectEvents.push({ event: req, respond, kind: "select" });
        }
        return true;
      }

      // Input: match to queued secret key or unmatched question input
      if (method === "input") {
        advanceSecretBatch();

        if (activeSecretBatch.length > 0) {
          // Metadata available — process immediately
          const secretMeta = activeSecretBatch.shift();
          processInput(req, secretMeta, respond);
        } else {
          // No metadata yet — defer
          console.log(`  [DEFER] input event buffered — waiting for tool_execution_start metadata`);
          deferredInputEvents.push({ event: req, respond, kind: "input" });
        }
        return true;
      }

      // Editor: respond with prefill or empty
      if (method === "editor") {
        respond(serializeJsonLine({
          type: "extension_ui_response",
          id,
          value: (req as any).prefill ?? "",
        }));
        return true;
      }

      // Unknown method: cancel to avoid hanging
      console.warn(`  [WARN] Unknown extension_ui_request method: ${method}, cancelling`);
      respond(serializeJsonLine({
        type: "extension_ui_response",
        id,
        cancelled: true,
      }));
      return true;
    }

    return false;
  }

  function getStats(): InjectorStats {
    return { ...stats };
  }

  return { handleEvent, getStats };
}
