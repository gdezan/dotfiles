import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AuthEntry } from "./types.ts";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

function record(value: unknown): AuthEntry | undefined {
	return value && typeof value === "object" && !Array.isArray(value) ? value as AuthEntry : undefined;
}

function text(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}

export async function fetchOpenaiPlanPayload(
	native: AuthEntry,
	companion: unknown,
	cliAuthFile = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "auth.json"),
): Promise<unknown> {
	const clientId = text(native.clientId);
	if (native.type !== "oauth" || !text(native.access) || !clientId ||
		!Array.isArray(native.scopes) || !native.scopes.includes("chatgpt.tokens.use.direct")) {
		throw new Error("OpenAI shared-plan usage requires /login openai with ChatGPT");
	}

	let auth = record(companion);
	if (companion === undefined) {
		try {
			const stored = record(JSON.parse(await readFile(cliAuthFile, "utf8")));
			const tokens = record(stored?.tokens);
			auth = stored?.auth_mode === "chatgpt" ? {
				type: "oauth", access: tokens?.access_token, accountId: tokens?.account_id,
			} : undefined;
		} catch {
			throw new Error("OpenAI shared-plan usage needs /login openai-codex or a Codex CLI login for the same account/workspace");
		}
	}
	const access = text(auth?.access);
	const accountId = text(auth?.accountId);
	if (auth?.type !== "oauth" || !access || !accountId) {
		throw new Error("Companion Codex OAuth is not configured; use /login openai-codex or sign in to Codex CLI");
	}
	if (typeof auth.expires === "number" && auth.expires <= Date.now()) {
		throw new Error("Companion Codex OAuth expired; use /login openai-codex");
	}

	const headers = { accept: "application/json", authorization: `Bearer ${access}`, "chatgpt-account-id": accountId };
	const signal = AbortSignal.timeout(10_000);
	const get = async (url: string): Promise<unknown> => {
		const response = await fetch(url, { headers, signal, redirect: "error" });
		if (!response.ok) {
			void response.body?.cancel().catch(() => undefined);
			if (response.status === 401 || response.status === 403) {
				throw new Error("Companion Codex OAuth was rejected; use /login openai-codex or sign in to Codex CLI again");
			}
			throw new Error(`OpenAI shared-plan usage request returned ${response.status}`);
		}
		return response.json();
	};
	const apps = record(await get(`${USAGE_URL}/chatpass/apps`));
	const items = apps?.items;
	if (!apps || Object.keys(apps).some((key) => key !== "items") || !Array.isArray(items) ||
		items.length > 128 || items.some((item) => !text(record(item)?.id)) ||
		items.filter((item) => record(item)?.id === clientId).length !== 1) {
		throw new Error("OpenAI app registration was not uniquely verified; use the same account/workspace for OpenAI and Codex");
	}
	return get(USAGE_URL);
}
