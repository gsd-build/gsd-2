export function shouldRedirectAutoToHeadless(
  subcommand: string | undefined,
  stdinIsTTY: boolean | undefined,
  stdoutIsTTY: boolean | undefined,
): boolean {
  if (subcommand !== 'auto') return false
  return stdinIsTTY !== true || stdoutIsTTY !== true
}
