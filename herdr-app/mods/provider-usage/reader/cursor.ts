/** Cursor account quota uses the desktop login, not pi-cursor-sdk's API key. */
import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { Snapshot, Window } from "./types.ts";
import { clampPercent, finite, snapshot } from "./types.ts";

const runFile = promisify(execFile);
const TIMEOUT_MS = 10_000;

function credentialPath(): string {
	const base = process.platform === "darwin"
		? join(homedir(), "Library", "Application Support")
		: process.platform === "win32"
			? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
			: process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
	return join(base, "Cursor", "User", "globalStorage", "state.vscdb");
}

function record(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object" && !Array.isArray(value)
		? value as Record<string, unknown>
		: undefined;
}

function epochSeconds(value: unknown): number | undefined {
	if (typeof value !== "string" || !value.trim()) return undefined;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined;
}

/** Use dashboard percentages, not monetary used/limit: they have different semantics. */
export function parseCursorUsage(value: unknown): Snapshot {
	const root = record(value);
	const plan = record(record(root?.individualUsage)?.plan);
	if (!plan || plan.enabled === false) throw new Error("Cursor usage response contained no enabled plan quota");
	const resetAt = epochSeconds(root?.billingCycleEnd);
	const startAt = epochSeconds(root?.billingCycleStart);
	const windowSeconds = resetAt !== undefined && startAt !== undefined && resetAt > startAt
		? resetAt - startAt
		: undefined;
	const windows: Window[] = [];
	for (const [key, label] of [["autoPercentUsed", "Cursor"], ["apiPercentUsed", "Other"]]) {
		const usedPercent = finite(plan[key]);
		if (usedPercent === undefined) continue;
		windows.push({ label, usedPercent: clampPercent(usedPercent), resetAt, windowSeconds });
	}
	const result = snapshot(windows);
	if (!result) throw new Error("Cursor usage response contained no recognized percentages");
	return result;
}

async function sessionCookie(path: string): Promise<string> {
	// Isolate synchronous SQLite work and its experimental warnings from Pi's TUI.
	// Only stdout carries the token, captured in memory; child errors are never surfaced raw.
	let token: string;
	try {
		const { stdout } = await runFile(process.execPath, ["--input-type=module", "-e", `
			import { DatabaseSync } from 'node:sqlite';
			const db = new DatabaseSync(process.argv[1], { readOnly: true });
			try {
				const row = db.prepare('SELECT value FROM ItemTable WHERE key = ? LIMIT 1').get('cursorAuth/accessToken');
				process.stdout.write(JSON.stringify(row?.value ?? null));
			} finally { db.close(); }
		`, path], { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 });
		const value: unknown = JSON.parse(stdout);
		if (typeof value !== "string" || !value.trim()) throw new Error("missing token");
		token = value;
	} catch {
		throw new Error("Cursor desktop credentials are not configured or unreadable; open Cursor and sign in");
	}
	let claims: Record<string, unknown> | undefined;
	try {
		const payload = Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8");
		claims = record(JSON.parse(payload));
	} catch {
		throw new Error("Cursor desktop credentials are invalid; open Cursor and sign in again");
	}
	const userId = typeof claims?.sub === "string" ? claims.sub.split("|").at(-1) : undefined;
	if (!userId || !/^[A-Za-z0-9._-]+$/.test(userId) || !/^[A-Za-z0-9._-]+$/.test(token)) {
		throw new Error("Cursor desktop credentials are invalid; open Cursor and sign in again");
	}
	const expires = finite(claims?.exp);
	if (expires !== undefined && expires <= Date.now() / 1000) {
		throw new Error("Cursor desktop login expired; open Cursor and sign in again");
	}
	return `WorkosCursorSessionToken=${userId}%3A%3A${token}`;
}

/** Read-only observer. Never refreshes or changes Cursor's credentials. */
export async function fetchCursorUsage(path = credentialPath()): Promise<Snapshot> {
	const cookie = await sessionCookie(path);
	const response = await fetch("https://cursor.com/api/usage-summary", {
		method: "GET",
		redirect: "error",
		signal: AbortSignal.timeout(TIMEOUT_MS),
		headers: { accept: "application/json", cookie },
	});
	if (!response.ok) {
		void response.body?.cancel().catch(() => undefined);
		if (response.status === 401 || response.status === 403) {
			throw new Error("Cursor desktop login was rejected; open Cursor and sign in again");
		}
		throw new Error(`Cursor usage request returned ${response.status}`);
	}
	return parseCursorUsage(await response.json());
}
