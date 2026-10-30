/**
 * Claude Code subscription usage.
 *
 * Reads Claude Code's own OAuth store (~/.claude/.credentials.json) rather than
 * pi's auth.json — Claude Code is a separate login from any pi provider, and
 * this adapter only observes its quota. Ported from the scoutr bridge's
 * usage/claude.ts, narrowed to the record-poking style of this extension.
 *
 * This reader does not refresh or write credentials.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Snapshot, Window } from "./types.ts";
import { clampPercent, finite, snapshot } from "./types.ts";

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
const CREDENTIALS_PATH = join(CLAUDE_DIR, ".credentials.json");
const STATE_PATH = `${CLAUDE_DIR}.json`;

const CLAUDE_USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CLAUDE_USAGE_BETA = "oauth-2025-04-20";
const CLAUDE_TIMEOUT_MS = 10_000;

/**
 * Anthropic buckets requests by user-agent: an unrecognized one lands in an
 * aggressively rate-limited pool that answers 429 almost immediately. Claude
 * Code records its own version in ~/.claude.json, so track that rather than
 * pinning a version string that silently ages out.
 */
const CLAUDE_FALLBACK_VERSION = "2.1.0";

const TOKEN_SKEW_MS = 5 * 60 * 1000;

// ── Record helpers ────────────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function stringField(recordValue: Record<string, unknown>, key: string): string | undefined {
	const value = recordValue[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ── Response parsing ──────────────────────────────────────────────────

function claudeResetAt(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return Math.round(value > 10_000_000_000 ? value / 1000 : value);
	}
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (/^\d+(?:\.\d+)?$/.test(trimmed)) return claudeResetAt(Number(trimmed));
	const parsed = Date.parse(trimmed);
	return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

function claudeWindowSeconds(label: string): number | undefined {
	if (label === "5h") return 5 * 60 * 60;
	if (label === "7d" || label.startsWith("7d ")) return 7 * 24 * 60 * 60;
	return undefined;
}

function claudeWindow(
	value: unknown,
	label: string,
	percentKey: "utilization" | "percent" = "utilization",
): Window | undefined {
	const recordValue = record(value);
	if (!recordValue) return undefined;
	const usedPercent = finite(recordValue[percentKey]) ?? finite(recordValue.used_percentage);
	if (usedPercent === undefined) return undefined;
	return {
		label,
		usedPercent: clampPercent(usedPercent),
		windowSeconds: claudeWindowSeconds(label),
		resetAt: claudeResetAt(recordValue.resets_at),
	};
}

function scopedClaudeLabel(limit: Record<string, unknown>): string {
	const scope = record(limit.scope);
	const model = record(scope?.model);
	const displayName = stringField(model ?? {}, "display_name") ?? stringField(model ?? {}, "displayName");
	return displayName && displayName.trim() !== "" ? `7d ${displayName.trim()}` : "7d scoped";
}

/** The `limits[]` shape supersedes the legacy five_hour/seven_day keys; both may appear. */
function windowsFromClaudeLimits(root: Record<string, unknown>): Window[] {
	const limits = root.limits;
	if (!Array.isArray(limits)) return [];
	const windows: Window[] = [];
	for (const limit of limits) {
		const recordValue = record(limit);
		if (!recordValue || typeof recordValue.kind !== "string") continue;
		const label =
			recordValue.kind === "session"
				? "5h"
				: recordValue.kind === "weekly_all"
					? "7d"
					: recordValue.kind === "weekly_scoped"
						? scopedClaudeLabel(recordValue)
						: undefined;
		if (!label) continue;
		const window = claudeWindow(recordValue, label, "percent");
		if (window) windows.push(window);
	}
	return windows;
}

/** Convert Claude Code's OAuth usage response into the shared quota-window model. */
export function parseClaudeUsage(value: unknown): Snapshot {
	const root = record(value);
	if (!root) throw new Error("Claude usage response was not an object");

	const legacyWindows = [
		claudeWindow(root.five_hour, "5h"),
		claudeWindow(root.seven_day, "7d"),
		claudeWindow(root.seven_day_opus, "7d Opus"),
		claudeWindow(root.seven_day_sonnet, "7d Sonnet"),
	];
	const windowsByLabel = new Map<string, Window>();
	for (const window of legacyWindows) {
		if (window && !windowsByLabel.has(window.label)) windowsByLabel.set(window.label, window);
	}
	for (const window of windowsFromClaudeLimits(root)) windowsByLabel.set(window.label, window);
	const preferredOrder = ["5h", "7d", "7d Opus", "7d Sonnet"];
	const windows = [
		...preferredOrder.flatMap((label) => (windowsByLabel.has(label) ? [windowsByLabel.get(label)!] : [])),
		...[...windowsByLabel.values()].filter((window) => !preferredOrder.includes(window.label)),
	];

	const result = snapshot(windows);
	if (!result) throw new Error("Claude usage response contained no recognized windows");
	return result;
}

// ── Credentials ───────────────────────────────────────────────────────

interface ClaudeCredentials {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
}

async function readClaudeCredentials(path: string): Promise<ClaudeCredentials | undefined> {
	let file: unknown;
	try {
		file = JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		// A missing credential file means the user has not signed in yet; any
		// other read failure is a real error worth surfacing.
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
		throw error;
	}
	const oauth = record(record(file)?.claudeAiOauth);
	const accessToken = stringField(oauth ?? {}, "accessToken");
	if (!accessToken) return undefined;
	return {
		accessToken,
		refreshToken: stringField(oauth!, "refreshToken"),
		expiresAt: finite(oauth!.expiresAt),
	};
}

/** Claude Code records the version it last onboarded with; it is the closest thing to "installed version". */
async function claudeUserAgent(statePath: string): Promise<string> {
	try {
		const state = record(JSON.parse(await readFile(statePath, "utf8")));
		const version = stringField(state ?? {}, "lastOnboardingVersion");
		if (version && /^\d+\.\d+/.test(version)) return `claude-code/${version}`;
	} catch {
		// Fall through to the pinned version; a plausible UA still beats none.
	}
	return `claude-code/${CLAUDE_FALLBACK_VERSION}`;
}

// ── Fetch ─────────────────────────────────────────────────────────────

async function claudeUsageError(response: Response): Promise<Error> {
	let detail: string | undefined;
	try {
		const body = record(await response.json());
		detail = stringField(record(body?.error) ?? {}, "message");
	} catch {
		// The status still gives the user a searchable failure when the body is not JSON.
	}
	return new Error(`Claude usage request returned ${response.status}${detail ? `: ${detail}` : ""}`);
}

async function requestClaudeUsage(accessToken: string, userAgent: string): Promise<Response> {
	return fetch(CLAUDE_USAGE_URL, {
		signal: AbortSignal.timeout(CLAUDE_TIMEOUT_MS),
		headers: {
			authorization: `Bearer ${accessToken}`,
			"anthropic-beta": CLAUDE_USAGE_BETA,
			"content-type": "application/json",
			"user-agent": userAgent,
		},
	});
}

/** Fetch Claude Code subscription usage from Claude Code's own OAuth store. */
export async function fetchClaudeUsage(): Promise<Snapshot> {
	let credentials = await readClaudeCredentials(CREDENTIALS_PATH);
	if (!credentials) throw new Error("Claude Code OAuth credentials are not configured; run `claude` to sign in");

	if (credentials.expiresAt !== undefined && credentials.expiresAt - TOKEN_SKEW_MS <= Date.now()) {
		throw new Error("Claude Code token expired; open Claude Code to refresh it");
	}

	const userAgent = await claudeUserAgent(STATE_PATH);
	let response = await requestClaudeUsage(credentials.accessToken, userAgent);

	if (response.status === 401) {
		void response.body?.cancel().catch(() => undefined);
		// `claude` may have rotated the token on disk while we held the old one.
		const onDisk = await readClaudeCredentials(CREDENTIALS_PATH);
		if (!onDisk || onDisk.accessToken === credentials.accessToken) throw new Error("Claude Code token expired; open Claude Code to refresh it");
		credentials = onDisk;
		response = await requestClaudeUsage(credentials.accessToken, userAgent);
	}

	if (!response.ok) throw await claudeUsageError(response);
	return parseClaudeUsage(await response.json());
}
