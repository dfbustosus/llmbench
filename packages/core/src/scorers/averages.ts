import type { ScoreResult } from "@llmbench/types";

/** Compute per-scorer averages from a result-id → scores mapping. */
export function computeScorerAverages(
	allScores: Record<string, ScoreResult[]>,
): Record<string, number> {
	const totals = new Map<string, { sum: number; count: number }>();
	for (const scoreList of Object.values(allScores)) {
		for (const score of scoreList) {
			const existing = totals.get(score.scorerName) ?? { sum: 0, count: 0 };
			existing.sum += score.value;
			existing.count++;
			totals.set(score.scorerName, existing);
		}
	}
	const result: Record<string, number> = {};
	for (const [name, { sum, count }] of totals) {
		result[name] = count > 0 ? sum / count : 0;
	}
	return result;
}
