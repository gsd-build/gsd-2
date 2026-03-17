/**
 * Answer file schema — types and validation for pre-supplied answers.
 *
 * The answer file is a JSON file that maps question IDs to answers and
 * secret key names to values. Used by the answer injector to respond to
 * `ask_user_questions` and `secure_env_collect` tool calls in headless mode.
 *
 * Validated at load time — malformed files fail fast with descriptive errors.
 */

import { readFile } from "node:fs/promises";

// ── Types ────────────────────────────────────────────────────────────────────

export type DefaultStrategy = "first_option" | "cancel";

export interface AnswerFileDefaults {
  /** What to do when a question has no pre-supplied answer */
  strategy: DefaultStrategy;
}

export interface AnswerFile {
  /**
   * Map of question ID → answer.
   * - string for single-select (the option label to select)
   * - string[] for multi-select (array of option labels)
   */
  questions: Record<string, string | string[]>;

  /**
   * Map of env var name → secret value.
   * Used for `secure_env_collect` runtime fallback via ctx.ui.input().
   */
  secrets: Record<string, string>;

  /** Fallback behavior for unmatched questions */
  defaults: AnswerFileDefaults;
}

// ── Validation ───────────────────────────────────────────────────────────────

const VALID_STRATEGIES: DefaultStrategy[] = ["first_option", "cancel"];

/**
 * Validate a parsed object as an AnswerFile.
 * Throws with a descriptive error if validation fails.
 */
function validateAnswerFile(data: unknown): AnswerFile {
  if (data == null || typeof data !== "object") {
    throw new Error("Answer file must be a JSON object");
  }

  const obj = data as Record<string, unknown>;

  // questions — required, must be Record<string, string | string[]>
  if (!("questions" in obj) || obj.questions == null || typeof obj.questions !== "object") {
    throw new Error("Answer file must have a 'questions' field (object mapping question IDs to answers)");
  }
  const questions = obj.questions as Record<string, unknown>;
  for (const [id, answer] of Object.entries(questions)) {
    if (typeof answer === "string") continue;
    if (Array.isArray(answer) && answer.every((a) => typeof a === "string")) continue;
    throw new Error(
      `Answer file: questions["${id}"] must be a string or string[] — got ${typeof answer}${Array.isArray(answer) ? " (array with non-string elements)" : ""}`
    );
  }

  // secrets — required, must be Record<string, string>
  if (!("secrets" in obj) || obj.secrets == null || typeof obj.secrets !== "object") {
    throw new Error("Answer file must have a 'secrets' field (object mapping env var names to values)");
  }
  const secrets = obj.secrets as Record<string, unknown>;
  for (const [key, value] of Object.entries(secrets)) {
    if (typeof value !== "string") {
      throw new Error(`Answer file: secrets["${key}"] must be a string — got ${typeof value}`);
    }
  }

  // defaults — required, must have strategy
  if (!("defaults" in obj) || obj.defaults == null || typeof obj.defaults !== "object") {
    throw new Error("Answer file must have a 'defaults' field with a 'strategy' property");
  }
  const defaults = obj.defaults as Record<string, unknown>;
  if (!("strategy" in defaults) || typeof defaults.strategy !== "string") {
    throw new Error("Answer file: defaults.strategy must be a string ('first_option' or 'cancel')");
  }
  if (!VALID_STRATEGIES.includes(defaults.strategy as DefaultStrategy)) {
    throw new Error(
      `Answer file: defaults.strategy must be one of: ${VALID_STRATEGIES.join(", ")} — got "${defaults.strategy}"`
    );
  }

  return {
    questions: questions as Record<string, string | string[]>,
    secrets: secrets as Record<string, string>,
    defaults: { strategy: defaults.strategy as DefaultStrategy },
  };
}

/**
 * Load and validate an answer file from disk.
 * Fails fast with descriptive errors on parse or validation failure.
 */
export async function loadAnswerFile(filePath: string): Promise<AnswerFile> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err: any) {
    throw new Error(`Failed to read answer file at ${filePath}: ${err.message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    throw new Error(`Failed to parse answer file as JSON: ${err.message}`);
  }

  return validateAnswerFile(parsed);
}

/**
 * Validate an already-parsed object as an AnswerFile (for inline/programmatic use).
 */
export function parseAnswerFile(data: unknown): AnswerFile {
  return validateAnswerFile(data);
}
