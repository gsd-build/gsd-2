import * as fs from "node:fs";
import * as path from "node:path";

const TRUSTED_PROJECTS_FILE = "trusted-projects.json";

function getTrustedProjectsPath(agentDir: string): string {
	return path.join(agentDir, TRUSTED_PROJECTS_FILE);
}

function readTrustedProjects(agentDir: string): Set<string> {
	const filePath = getTrustedProjectsPath(agentDir);
	try {
		const content = fs.readFileSync(filePath, "utf-8");
		const parsed = JSON.parse(content);
		if (Array.isArray(parsed)) {
			return new Set(parsed.filter((p) => typeof p === "string"));
		}
	} catch {
		// File missing or malformed — start with empty set
	}
	return new Set();
}

function writeTrustedProjects(agentDir: string, trusted: Set<string>): void {
	const filePath = getTrustedProjectsPath(agentDir);
	fs.mkdirSync(agentDir, { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify([...trusted], null, 2), "utf-8");
}

export function isProjectTrusted(projectPath: string, agentDir: string): boolean {
	const canonical = path.resolve(projectPath);
	return readTrustedProjects(agentDir).has(canonical);
}

export function trustProject(projectPath: string, agentDir: string): void {
	const canonical = path.resolve(projectPath);
	const trusted = readTrustedProjects(agentDir);
	trusted.add(canonical);
	writeTrustedProjects(agentDir, trusted);
}

export function getUntrustedExtensionPaths(
	projectPath: string,
	extensionPaths: string[],
	agentDir: string,
): string[] {
	if (isProjectTrusted(projectPath, agentDir)) {
		return [];
	}
	return extensionPaths;
}
