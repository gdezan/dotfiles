/**
 * Quota window spans.
 *
 * The popup draws an elapsed-time guide across each bar, which needs to know
 * how long the window runs — not just when it resets. Providers report the
 * reset instant reliably but the span only sometimes, so it is derived from the
 * window label here rather than each adapter carrying its own table.
 */

const HOUR = 60 * 60;
const DAY = 24 * HOUR;

const FIXED_WINDOW_SECONDS = new Map<string, number>([
	["5h", 5 * HOUR],
	["7d", 7 * DAY],
	["day", DAY],
	["wk", 7 * DAY],
]);

/**
 * Seconds in the calendar month ending at `resetAt`.
 *
 * Monthly caps ride a billing anchor, so the span is 28-31 days depending on
 * where the anchor falls; anchors past the length of the previous month (the
 * 31st, say) clamp to its last day, the way billing itself does.
 */
function calendarMonthSeconds(resetAt: number): number {
	const reset = new Date(resetAt * 1000);
	const anchorDay = reset.getUTCDate();
	const start = new Date(reset);
	// Move to the 1st first, so shifting the month cannot overflow into the next.
	start.setUTCDate(1);
	start.setUTCMonth(start.getUTCMonth() - 1);
	const daysInStartMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
	start.setUTCDate(Math.min(anchorDay, daysInStartMonth));
	return Math.round((reset.getTime() - start.getTime()) / 1000);
}

/** Span of a labeled quota window, or undefined when it cannot be known. */
export function windowSecondsFor(label: string, resetAt?: number): number | undefined {
	const key = label.trim().toLowerCase();
	const fixed = FIXED_WINDOW_SECONDS.get(key);
	if (fixed !== undefined) return fixed;
	if (key === "mo" && resetAt !== undefined) return calendarMonthSeconds(resetAt);
	return undefined;
}

/**
 * Elapsed fraction of the window's time span, 0..1 — the position of the
 * "expected usage" guide on a bar. Undefined when the span is unknown.
 */
export function windowTimeProgress(window: { windowSeconds?: number; resetAt?: number }, nowSeconds: number): number | undefined {
	const duration = window.windowSeconds;
	const resetAt = window.resetAt;
	if (duration === undefined || duration <= 0 || resetAt === undefined) return undefined;
	const elapsed = nowSeconds - (resetAt - duration);
	return Math.max(0, Math.min(1, elapsed / duration));
}

/** Countdown until a window resets, in the footer's `↺ 2h15m` style. */
export function countdown(resetAt: number | undefined): string {
	if (resetAt === undefined) return "";
	const seconds = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3_600);
	const minutes = Math.floor((seconds % 3_600) / 60);
	if (days > 0) return `↺ ${days}d${hours}h`;
	if (hours > 0) return `↺ ${hours}h${minutes}m`;
	return `↺ ${minutes}m`;
}
