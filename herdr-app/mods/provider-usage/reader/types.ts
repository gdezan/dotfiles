/** Shared quota-window model used by the footer, the popup, and the adapters. */

export type Window = {
	label: string;
	usedPercent: number;
	/** Absolute balance for wallet-style providers (DeepSeek) or consumed credits. */
	amount?: number;
	/** Optional limit for amount-style providers, e.g. Copilot monthly credits. */
	limitAmount?: number;
	/** Currency code (USD, CNY) or unit marker (cr) for amount-style providers. */
	currency?: string;
	windowSeconds?: number;
	resetAt?: number;
};

export type Snapshot = {
	windows: Window[];
	updatedAt: number;
};

export type AuthEntry = Record<string, unknown>;

export function finite(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function clampPercent(value: number): number {
	return Math.max(0, Math.min(100, value));
}

export function snapshot(windows: Array<Window | undefined>): Snapshot | undefined {
	const valid = windows.filter((window): window is Window => window !== undefined);
	if (valid.length === 0) return undefined;
	return { windows: valid, updatedAt: Date.now() };
}
