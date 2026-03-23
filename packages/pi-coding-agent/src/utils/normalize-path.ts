import { homedir } from "os";
import { join } from "path";

/**
 * Normalize a file-system path, expanding `~` to the user's home directory.
 */
export function normalizePath(input: string): string {
	const trimmed = input.trim();
	if (trimmed === "~") return homedir();
	if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
	if (trimmed.startsWith("~")) return join(homedir(), trimmed.slice(1));
	return trimmed;
}
