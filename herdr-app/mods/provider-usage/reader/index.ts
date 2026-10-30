import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fetchAntigravityUsage } from "./antigravity.ts";
import { fetchClaudeUsage } from "./claude.ts";
import { fetchCursorUsage } from "./cursor.ts";
import { fetchOpenaiPlanPayload } from "./openai.ts";
import type { AuthEntry, Snapshot, Window } from "./types.ts";
import { countdown, windowSecondsFor } from "./windows.ts";

type ProviderSpec = {
	/** Unique id used for status/footer keys and command names. */
	id: string;
	/** Human label in notifications ("Codex", "xAI"). */
	name: string;
	/** model.provider values this adapter owns. */
	providers: readonly string[];
	/** auth.json top-level key; omit for adapters that read their own store (Claude, Antigravity). */
	authKey?: string;
	/** Fetch a fresh snapshot using stored credentials. */
	fetch: (auth: AuthEntry) => Promise<Snapshot>;
	/** Optional incremental update from response headers. */
	parseHeaders?: (headers: Record<string, string>) => Snapshot | undefined;
	/** Optional OAuth refresh when access is near expiry. */
	refreshAuth?: (auth: AuthEntry) => Promise<AuthEntry | undefined>;
};

// ── Constants ─────────────────────────────────────────────────────────

const STATUS_ID = "provider-usage";
const FOOTER_ID = "provider-usage";
const FIVE_HOURS = 5 * 60 * 60;
const SEVEN_DAYS = 7 * 24 * 60 * 60;
const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

const CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";
const XAI_USER_URL = "https://cli-chat-proxy.grok.com/v1/user";
const XAI_BILLING_URL = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";
const COPILOT_BILLING_URL = "https://api.github.com";
const COPILOT_BILLING_AUTH_KEY = "github-copilot-billing";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR?.trim() || join(homedir(), ".pi", "agent");
const AUTH_FILE = join(AGENT_DIR, "auth.json");

// ── Helpers ───────────────────────────────────────────────────────────

function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

function normalizeResetAt(value: unknown): number | undefined {
	const number = finite(value);
	if (number === undefined) return undefined;
	// Accept seconds or milliseconds epoch.
	return number > 10_000_000_000 ? Math.round(number / 1000) : Math.round(number);
}

function resetAtFromIso(value: unknown): number | undefined {
	if (typeof value !== "string" || value.trim() === "") return undefined;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
	const direct = headers[name];
	if (direct !== undefined) return direct;
	const lower = name.toLowerCase();
	const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === lower);
	return entry?.[1];
}

function headerNumber(headers: Record<string, string>, name: string): number | undefined {
	const raw = headerValue(headers, name);
	if (raw === undefined || raw.trim() === "") return undefined;
	const value = Number(raw);
	return Number.isFinite(value) ? value : undefined;
}

async function readAuthFile(): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(AUTH_FILE, "utf8")) as Record<string, unknown>;
}

async function readAuthEntry(authKey: string): Promise<AuthEntry> {
	const auth = await readAuthFile();
	const entry = auth[authKey];
	if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
		throw new Error(`${authKey} credentials are not configured in Pi`);
	}
	return entry as AuthEntry;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), ms);
	try {
		return await work(controller.signal);
	} finally {
		clearTimeout(timeout);
	}
}

function snapshot(windows: Array<Window | undefined>): Snapshot | undefined {
	const valid = windows.filter((window): window is Window => window !== undefined);
	if (valid.length === 0) return undefined;
	return { windows: valid, updatedAt: Date.now() };
}

function windowFromUsedPercent(
	label: string,
	usedPercent: number | undefined,
	opts: { windowSeconds?: number; resetAt?: number } = {},
): Window | undefined {
	if (usedPercent === undefined) return undefined;
	return {
		label,
		usedPercent: clampPercent(usedPercent),
		windowSeconds: opts.windowSeconds,
		resetAt: opts.resetAt,
	};
}

function windowFromAmount(
	label: string,
	amount: number | undefined,
	currency: string | undefined,
): Window | undefined {
	if (amount === undefined || currency === undefined) return undefined;
	return {
		label,
		usedPercent: 0,
		amount,
		currency,
	};
}

// ── Codex adapter ─────────────────────────────────────────────────────

function parseCodexWindow(value: unknown, fallbackLabel: string): Window | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	const usedPercent = finite(record.used_percent);
	if (usedPercent === undefined) return undefined;
	const windowSeconds = finite(record.limit_window_seconds);
	let label = fallbackLabel;
	if (windowSeconds === FIVE_HOURS) label = "5h";
	else if (windowSeconds === SEVEN_DAYS) label = "7d";
	return {
		label,
		usedPercent: clampPercent(usedPercent),
		windowSeconds,
		resetAt: normalizeResetAt(record.reset_at),
	};
}

function parseCodexUsage(value: unknown): Snapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const rateLimit = (value as { rate_limit?: unknown }).rate_limit;
	if (!rateLimit || typeof rateLimit !== "object" || Array.isArray(rateLimit)) return undefined;
	const bucket = rateLimit as Record<string, unknown>;
	return snapshot([
		parseCodexWindow(bucket.primary_window, "primary"),
		parseCodexWindow(bucket.secondary_window, "secondary"),
	]);
}

function parseCodexHeaders(headers: Record<string, string>): Snapshot | undefined {
	const parse = (which: "primary" | "secondary", fallbackLabel: string): Window | undefined => {
		const usedPercent = headerNumber(headers, `x-codex-${which}-used-percent`);
		if (usedPercent === undefined) return undefined;
		const minutes = headerNumber(headers, `x-codex-${which}-window-minutes`);
		const windowSeconds = minutes === undefined ? undefined : minutes * 60;
		let label = fallbackLabel;
		if (windowSeconds === FIVE_HOURS) label = "5h";
		else if (windowSeconds === SEVEN_DAYS) label = "7d";
		return {
			label,
			usedPercent: clampPercent(usedPercent),
			windowSeconds,
			resetAt: normalizeResetAt(headerNumber(headers, `x-codex-${which}-reset-at`)),
		};
	};
	return snapshot([parse("primary", "primary"), parse("secondary", "secondary")]);
}

async function fetchCodexUsage(auth: AuthEntry): Promise<Snapshot> {
	const access = stringField(auth, "access");
	const accountId = stringField(auth, "accountId");
	if (!access) throw new Error("OpenAI Codex OAuth is not configured in Pi");

	const snapshotValue = await withTimeout(async (signal) => {
		const response = await fetch(CODEX_USAGE_URL, {
			signal,
			headers: {
				accept: "application/json",
				authorization: `Bearer ${access}`,
				...(accountId ? { "chatgpt-account-id": accountId } : {}),
			},
		});
		if (!response.ok) throw new Error(`Codex usage request returned ${response.status}`);
		return parseCodexUsage(await response.json());
	});
	if (!snapshotValue) throw new Error("Codex usage response contained no recognized windows");
	return snapshotValue;
}

// ── xAI adapter ───────────────────────────────────────────────────────

function parseXaiUsage(value: unknown): Snapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const root = value as Record<string, unknown>;
	const config =
		root.config && typeof root.config === "object" && !Array.isArray(root.config)
			? (root.config as Record<string, unknown>)
			: root;

	const period =
		config.currentPeriod && typeof config.currentPeriod === "object" && !Array.isArray(config.currentPeriod)
			? (config.currentPeriod as Record<string, unknown>)
			: undefined;
	const periodType = typeof period?.type === "string" ? period.type : "";

	let usedPercent = finite(config.creditUsagePercent);
	if (usedPercent === undefined) {
		const monthlyLimit = centsVal(config.monthlyLimit);
		const used = centsVal(config.used);
		if (monthlyLimit !== undefined && monthlyLimit > 0 && used !== undefined) {
			usedPercent = clampPercent((used / monthlyLimit) * 100);
		}
	}
	if (usedPercent === undefined) {
		const products = config.productUsage;
		if (Array.isArray(products)) {
			for (const product of products) {
				if (!product || typeof product !== "object" || Array.isArray(product)) continue;
				const pct = finite((product as Record<string, unknown>).usagePercent);
				if (pct !== undefined) {
					usedPercent = pct;
					break;
				}
			}
		}
	}
	// Endpoint omits creditUsagePercent at a fresh period start; treat as 0% used
	// when a typed period is present (matches grok-cli / official credits config).
	if (usedPercent === undefined && periodType.length > 0) usedPercent = 0;
	if (usedPercent === undefined) return undefined;

	const label = periodType.includes("WEEKLY")
		? "wk"
		: periodType.includes("MONTHLY")
			? "mo"
			: periodType.includes("DAILY")
				? "day"
				: "plan";

	const resetAt =
		resetAtFromIso(period?.end) ??
		resetAtFromIso(config.billingPeriodEnd) ??
		resetAtFromIso(config.resetAt) ??
		resetAtFromIso(config.reset_at);

	const startAt = resetAtFromIso(period?.start) ?? resetAtFromIso(config.billingPeriodStart);
	const windowSeconds =
		startAt !== undefined && resetAt !== undefined && resetAt > startAt ? resetAt - startAt : undefined;

	return snapshot([windowFromUsedPercent(label, usedPercent, { windowSeconds, resetAt })]);
}

function centsVal(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	return finite((value as Record<string, unknown>).val);
}

async function fetchXaiUsage(auth: AuthEntry): Promise<Snapshot> {
	const current = auth;
	if (finite(current.expires) !== undefined && Number(current.expires) <= Date.now()) throw new Error("xAI token expired; sign in to refresh it");

	const access = stringField(current, "access");
	if (!access) throw new Error("xAI OAuth is not configured in Pi");

	const headers: Record<string, string> = {
		accept: "application/json",
		authorization: `Bearer ${access}`,
		"X-XAI-Token-Auth": "xai-grok-cli",
	};

	const snapshotValue = await withTimeout(async (signal) => {
		// Identity first (optional but matches the official CLI contract); ignore failures.
		try {
			const identityResponse = await fetch(XAI_USER_URL, { signal, headers, redirect: "error" });
			if (identityResponse.ok) {
				const identity = (await identityResponse.json()) as Record<string, unknown>;
				const userId = stringField(identity, "userId");
				if (userId) headers["x-userid"] = userId;
			} else {
				void identityResponse.body?.cancel().catch(() => undefined);
			}
		} catch {
			// Billing often works with bearer alone.
		}

		const response = await fetch(XAI_BILLING_URL, { signal, headers, redirect: "error" });
		if (!response.ok) throw new Error(`xAI usage request returned ${response.status}`);
		return parseXaiUsage(await response.json());
	});
	if (!snapshotValue) throw new Error("xAI usage response contained no recognized windows");
	return snapshotValue;
}

// ── DeepSeek adapter ──────────────────────────────────────────────────

function parseDeepseekBalance(value: unknown): Snapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const root = value as Record<string, unknown>;
	const infos = root.balance_infos;
	if (!Array.isArray(infos) || infos.length === 0) return undefined;

	const windows: Window[] = [];
	for (const info of infos) {
		if (!info || typeof info !== "object" || Array.isArray(info)) continue;
		const record = info as Record<string, unknown>;
		const currency = stringField(record, "currency")?.toUpperCase();
		const totalBalance = parseFloat(stringField(record, "total_balance") ?? "");
		if (!Number.isFinite(totalBalance)) continue;
		windows.push({
			label: currency ?? "???",
			usedPercent: 0,
			amount: totalBalance,
			currency,
		});
	}

	if (windows.length === 0) return undefined;
	return { windows, updatedAt: Date.now() };
}

async function fetchDeepseekBalance(auth: AuthEntry): Promise<Snapshot> {
	const key = stringField(auth, "key");
	if (!key) throw new Error("DeepSeek API key is not configured in Pi");

	const snapshotValue = await withTimeout(async (signal) => {
		const response = await fetch(DEEPSEEK_BALANCE_URL, {
			signal,
			headers: {
				accept: "application/json",
				authorization: `Bearer ${key}`,
			},
		});
		if (!response.ok) throw new Error(`DeepSeek balance request returned ${response.status}`);
		return parseDeepseekBalance(await response.json());
	});
	if (!snapshotValue) throw new Error("DeepSeek balance response contained no recognized data");
	return snapshotValue;
}

// ── OpenCode Go adapter ───────────────────────────────────────────────

const OPENCODE_GO_WINDOWS = [
	{ key: "rolling", label: "5h" },
	{ key: "weekly", label: "wk" },
	{ key: "monthly", label: "mo" },
] as const;

function parseOpencodeGoUsage(value: unknown): Snapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const root = value as Record<string, unknown>;
	const usage = root.usage;
	if (!usage || typeof usage !== "object" || Array.isArray(usage)) return undefined;
	const buckets = usage as Record<string, unknown>;
	const windows: Window[] = [];
	for (const { key, label } of OPENCODE_GO_WINDOWS) {
		const bucket = buckets[key];
		if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) continue;
		const record = bucket as Record<string, unknown>;
		const percent = finite(record.percent);
		if (percent === undefined) continue;
		const resetAt = resetAtFromIso(record.resetsAt);
		windows.push({
			label,
			usedPercent: clampPercent(percent),
			windowSeconds: windowSecondsFor(label, resetAt),
			resetAt,
		});
	}
	return snapshot(windows);
}

async function fetchOpencodeGoUsage(auth: AuthEntry): Promise<Snapshot> {
	const key = stringField(auth, "key");
	if (!key) throw new Error("OpenCode Go API key is not configured in Pi");
	const snapshotValue = await withTimeout(async (signal) => {
		const response = await fetch(OPENCODE_GO_USAGE_URL, {
			signal,
			headers: {
				accept: "application/json",
				authorization: `Bearer ${key}`,
				// opencode.ai sits behind a WAF that 403s unrecognized clients before
				// auth is ever considered — without a client-shaped user-agent even the
				// documented /models endpoint is refused.
				"user-agent": "opencode/1.0",
			},
		});
		if (!response.ok) throw new Error(`OpenCode Go usage request returned ${response.status}`);
		return parseOpencodeGoUsage(await response.json());
	});
	if (!snapshotValue) throw new Error("OpenCode Go usage response contained no recognized windows");
	return snapshotValue;
}

// ── GitHub Copilot adapter ────────────────────────────────────────────

function parseCopilotBilling(value: unknown, maxCredits?: number): Snapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const root = value as Record<string, unknown>;
	const items = root.usageItems;
	if (!Array.isArray(items)) return undefined;

	let consumedCredits = 0;
	let billedCredits = 0;
	for (const item of items) {
		if (!item || typeof item !== "object" || Array.isArray(item)) continue;
		const record = item as Record<string, unknown>;
		consumedCredits += finite(record.grossQuantity) ?? 0;
		billedCredits += finite(record.netQuantity) ?? 0;
	}

	const displayCredits = consumedCredits > 0 ? consumedCredits : billedCredits;

	const timePeriod = root.timePeriod;
	const periodLabel =
		timePeriod && typeof timePeriod === "object" && !Array.isArray(timePeriod)
			? `${(timePeriod as Record<string, unknown>).year ?? ""}-${String((timePeriod as Record<string, unknown>).month ?? "").padStart(2, "0")}`
			: undefined;

	return {
		windows: [{
			label: periodLabel ?? "credits",
			usedPercent: 0,
			amount: displayCredits,
			limitAmount: maxCredits && maxCredits > 0 ? maxCredits : undefined,
			currency: "cr",
		}],
		updatedAt: Date.now(),
	};
}

async function fetchCopilotUsage(auth: AuthEntry): Promise<Snapshot> {
	const token = stringField(auth, "token");
	const username = stringField(auth, "username");
	const maxCredits = finite(auth.maxCredits);
	if (!token || !username) throw new Error("GitHub Copilot billing token not set. Use /usage set-copilot-token <ghp_...>");

	const snapshotValue = await withTimeout(async (signal) => {
		const url = `${COPILOT_BILLING_URL}/users/${encodeURIComponent(username)}/settings/billing/ai_credit/usage`;
		const response = await fetch(url, {
			signal,
			headers: {
				accept: "application/vnd.github+json",
				authorization: `Bearer ${token}`,
				"X-GitHub-Api-Version": "2026-03-10",
			},
		});
		if (!response.ok) throw new Error(`Copilot billing request returned ${response.status}`);
		return parseCopilotBilling(await response.json(), maxCredits);
	});
	if (!snapshotValue) throw new Error("Copilot billing response contained no usage data");
	return snapshotValue;
}

// ── Provider registry ─────────────────────────────────────────────────

const PROVIDERS: ProviderSpec[] = [
	// Quota belongs to the desktop account, which should match the SDK key's account.
	{
		id: "cursor",
		name: "Cursor",
		providers: ["cursor"],
		fetch: () => fetchCursorUsage(),
	},
	{
		id: "openai",
		name: "OpenAI",
		providers: ["openai"],
		fetch: async () => {
			try {
				const auth = await readAuthEntry("openai");
				const stored = await readAuthFile();
				const value = parseCodexUsage(await fetchOpenaiPlanPayload(auth, stored["openai-codex"]));
				if (!value) throw new Error("OpenAI shared-plan usage response contained no recognized windows");
				return value;
			} catch (primaryError) {
				try {
					return await fetchCodexUsage(await readAuthEntry("openai-codex"));
				} catch (fallbackError) {
					throw new Error(`OpenAI: ${String(primaryError)}; Codex fallback: ${String(fallbackError)}`);
				}
			}
		},
	},
	// Display-only observer: Claude Code is a separate login, so it never
	// matches ctx.model — the popup shows it, the footer cannot.
	{
		id: "claude",
		name: "Claude",
		providers: [],
		fetch: () => fetchClaudeUsage(),
	},
	{
		id: "opencode-go",
		name: "OpenCode Go",
		providers: ["opencode-go"],
		authKey: "opencode-go",
		fetch: fetchOpencodeGoUsage,
	},
	{
		id: "xai",
		name: "xAI",
		providers: ["xai", "xai-auth"],
		authKey: "xai",
		fetch: fetchXaiUsage,
	},
	{
		id: "copilot",
		name: "Copilot",
		providers: ["github-copilot"],
		authKey: COPILOT_BILLING_AUTH_KEY,
		fetch: fetchCopilotUsage,
	},
	// Display-only observer: Antigravity is a separate login, so it never
	// matches ctx.model — the popup shows it, the footer cannot.
	{
		id: "antigravity",
		name: "Antigravity",
		providers: [],
		fetch: () => fetchAntigravityUsage(),
	},
	{
		id: "deepseek",
		name: "DeepSeek",
		providers: ["deepseek"],
		authKey: "deepseek",
		fetch: fetchDeepseekBalance,
	},
];

const rows = await Promise.all(PROVIDERS.map(async (provider) => {
  try {
    const auth = provider.authKey ? await readAuthEntry(provider.authKey) : {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const snapshot = await Promise.race([provider.fetch(auth), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Usage request timed out")), 20000); })]).finally(() => clearTimeout(timer));
    return { id: provider.id, name: provider.name, snapshot };
  } catch (error) {
    return { id: provider.id, name: provider.name, error: error instanceof Error ? error.message : String(error) };
  }
}));
process.stdout.write(JSON.stringify({version: 1, rows}) + "\n", () => process.exit(0));
