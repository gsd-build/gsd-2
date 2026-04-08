/**
 * Extract a human-readable message from an unknown caught value.
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Safely extract the errno code from an unknown error value.
 * Returns undefined if the error has no code property.
 */
export function getErrnoCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Check if an unknown error has a specific errno code (e.g. "ENOENT", "EBUSY").
 * Replaces the repeated `(err as NodeJS.ErrnoException).code === "..."` pattern.
 */
export function isErrnoCode(err: unknown, code: string): boolean {
  return getErrnoCode(err) === code;
}
