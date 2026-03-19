/**
 * Format a numeric delta with sign prefix and optional suffix.
 */
export function formatDelta(delta: number, suffix = ""): string {
	const sign = delta > 0 ? "+" : "";
	return `${sign}${delta.toFixed(2)}${suffix}`;
}

/**
 * Return a Tailwind color class for a delta value.
 * @param invertPositive - when true, negative deltas are "good" (e.g. cost, latency)
 */
export function deltaColorClass(delta: number, invertPositive = false): string {
	if (Math.abs(delta) < 0.001) return "text-muted-foreground";
	const isGood = invertPositive ? delta < 0 : delta > 0;
	return isGood ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}
