import { execFile as execFileCb } from "node:child_process"
import { promisify } from "node:util"

const execFile = promisify(execFileCb)

/**
 * Run a Node.js subprocess with an --eval script and return parsed JSON output.
 *
 * @param execPath   Path to node executable (usually process.execPath)
 * @param args       Node argv — typically [...resolved.nodeArgs, script]
 * @param options    cwd, env, maxBuffer, timeout
 * @param label      Service name for error messages, e.g. "captures data"
 */
export async function runSubprocess<T>(
  execPath: string,
  args: string[],
  options: {
    cwd: string
    env: NodeJS.ProcessEnv
    maxBuffer: number
    timeout: number
  },
  label: string,
): Promise<T> {
  let stdout: string
  try {
    ;({ stdout } = await execFile(execPath, args, options))
  } catch (error: unknown) {
    const msg =
      error instanceof Error
        ? ((error as NodeJS.ErrnoException & { stderr?: string }).stderr || error.message)
        : String(error)
    throw new Error(`${label} subprocess failed: ${msg}`)
  }
  try {
    return JSON.parse(stdout) as T
  } catch (parseError) {
    throw new Error(
      `${label} subprocess returned invalid JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
    )
  }
}
