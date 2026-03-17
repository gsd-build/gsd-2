/**
 * Shared GSD phase state — allows cross-extension coordination
 *
 * GSD auto.ts sets the active phase; subagent/index.ts reads it
 * to prevent agents from conflicting with active GSD phases.
 */

let activePhase: string | null = null;
let autoActive = false;

/** Called by GSD auto.ts when a unit is dispatched */
export function setActiveGSDPhase(unitType: string | null): void {
	activePhase = unitType;
}

/** Called by GSD auto.ts when auto-mode starts/stops */
export function setGSDAutoActive(active: boolean): void {
	autoActive = active;
	if (!active) activePhase = null;
}

/** Returns the current GSD unit type (e.g., "plan-milestone") or null */
export function getActiveGSDPhase(): string | null {
	return activePhase;
}

/** Returns whether GSD auto-mode is currently running */
export function isGSDAutoActive(): boolean {
	return autoActive;
}
