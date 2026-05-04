/**
 * Disk-based cache for discovered models.
 * Stores results at {agentDir}/discovery-cache.json with per-provider TTLs.
 */

import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "../config.js";
import { type DiscoveredModel, getDefaultTTL } from "./model-discovery.js";

export interface DiscoveryCacheEntry {
	models: DiscoveredModel[];
	fetchedAt: number;
	ttlMs: number;
}

export interface DiscoveryCacheData {
	version: 1;
	entries: Record<string, DiscoveryCacheEntry>;
}

export class ModelDiscoveryCache {
	private data: DiscoveryCacheData;
	private cachePath: string;

	constructor(cachePath?: string) {
		this.cachePath = cachePath ?? join(getAgentDir(), "discovery-cache.json");
		this.data = { version: 1, entries: {} };
		this.load();
	}

	get(provider: string): DiscoveryCacheEntry | undefined {
		const entry = this.data.entries[provider];
		return entry;
	}

	set(provider: string, models: DiscoveredModel[], ttlMs?: number): void {
		// Re-read from disk to get the latest state before modifying
		this.load();
		this.data.entries[provider] = {
			models,
			fetchedAt: Date.now(),
			ttlMs: ttlMs ?? getDefaultTTL(provider),
		};
		this.save();
	}

	isStale(provider: string): boolean {
		const entry = this.data.entries[provider];
		if (!entry) return true;
		return Date.now() - entry.fetchedAt > entry.ttlMs;
	}

	clear(provider?: string): void {
		// Re-read from disk to get the latest state before modifying
		this.load();
		if (provider) {
			delete this.data.entries[provider];
		} else {
			this.data.entries = {};
		}
		this.save();
	}

	getAll(includeStale = false): Map<string, DiscoveryCacheEntry> {
		const result = new Map<string, DiscoveryCacheEntry>();
		for (const [provider, entry] of Object.entries(this.data.entries)) {
			if (includeStale || !this.isStale(provider)) {
				result.set(provider, entry);
			}
		}
		return result;
	}

	load(): void {
		try {
			if (existsSync(this.cachePath)) {
				const content = readFileSync(this.cachePath, "utf-8");
				const parsed = JSON.parse(content) as DiscoveryCacheData;
				if (parsed.version === 1 && parsed.entries) {
					this.data = parsed;
				}
			}
		} catch {
			// Corrupted or unreadable cache — start fresh
			this.data = { version: 1, entries: {} };
		}
	}

	save(): void {
		try {
			const dir = dirname(this.cachePath);
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true });
			}
			// Atomic write: write to temp file then rename to avoid partial reads
			const tmpPath = this.cachePath + ".tmp";
			const content = Buffer.from(JSON.stringify(this.data, null, 2), "utf-8");
			const fd = openSync(tmpPath, "w");
			try {
				writeSync(fd, content);
				fsyncSync(fd);
			} finally {
				closeSync(fd);
			}
			renameSync(tmpPath, this.cachePath);
		} catch {
			// Silently ignore write failures (read-only FS, permissions, etc.)
		}
	}
}
