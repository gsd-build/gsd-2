/**
 * Remote Questions — configuration resolution and validation
 */

import { loadEffectiveGSDPreferences, type RemoteQuestionsConfig } from "../gsd/preferences.js";
import type { RemoteChannel } from "./types.js";

export interface ResolvedConfig {
  channel: RemoteChannel;
  channelId: string;
  timeoutMs: number;
  pollIntervalMs: number;
  token: string;
}

const ENV_KEYS: Record<RemoteChannel, string> = {
  slack: "SLACK_BOT_TOKEN",
  discord: "DISCORD_BOT_TOKEN",
};

const DEFAULT_TIMEOUT_MINUTES = 5;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const MIN_TIMEOUT_MINUTES = 1;
const MAX_TIMEOUT_MINUTES = 30;
const MIN_POLL_INTERVAL_SECONDS = 2;
const MAX_POLL_INTERVAL_SECONDS = 30;

export function resolveRemoteConfig(): ResolvedConfig | null {
  const prefs = loadEffectiveGSDPreferences();
  const rq: RemoteQuestionsConfig | undefined = prefs?.preferences.remote_questions;
  if (!rq || !rq.channel || !rq.channel_id) return null;
  if (rq.channel !== "slack" && rq.channel !== "discord") return null;

  const token = process.env[ENV_KEYS[rq.channel]];
  if (!token) return null;

  const timeoutMinutes = clampNumber(rq.timeout_minutes, DEFAULT_TIMEOUT_MINUTES, MIN_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES);
  const pollIntervalSeconds = clampNumber(rq.poll_interval_seconds, DEFAULT_POLL_INTERVAL_SECONDS, MIN_POLL_INTERVAL_SECONDS, MAX_POLL_INTERVAL_SECONDS);

  return {
    channel: rq.channel,
    channelId: String(rq.channel_id),
    timeoutMs: timeoutMinutes * 60 * 1000,
    pollIntervalMs: pollIntervalSeconds * 1000,
    token,
  };
}

export function getRemoteConfigStatus(): string {
  const prefs = loadEffectiveGSDPreferences();
  const rq: RemoteQuestionsConfig | undefined = prefs?.preferences.remote_questions;
  if (!rq || !rq.channel || !rq.channel_id) return "Remote questions: not configured";
  if (rq.channel !== "slack" && rq.channel !== "discord") return `Remote questions: unknown channel type \"${rq.channel}\"`;
  const envVar = ENV_KEYS[rq.channel];
  if (!process.env[envVar]) return `Remote questions: ${envVar} not set — remote questions disabled`;

  const timeoutMinutes = clampNumber(rq.timeout_minutes, DEFAULT_TIMEOUT_MINUTES, MIN_TIMEOUT_MINUTES, MAX_TIMEOUT_MINUTES);
  const pollIntervalSeconds = clampNumber(rq.poll_interval_seconds, DEFAULT_POLL_INTERVAL_SECONDS, MIN_POLL_INTERVAL_SECONDS, MAX_POLL_INTERVAL_SECONDS);
  return `Remote questions: ${rq.channel} configured (timeout ${timeoutMinutes}m, poll ${pollIntervalSeconds}s)`;
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
