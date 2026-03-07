import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export class WeightedAverageScorer implements IScorer {
	readonly id = "weighted-average";
	readonly name: string;
	readonly type: ScorerType = "composite";
	private scorers: Array<{ scorer: IScorer; weight: number }>;

	constructor(scorers: Array<{ scorer: IScorer; weight: number }>, name?: string) {
		this.scorers = scorers;
		this.name = name ?? "Weighted Average";
	}

	async score(output: string, expected: string, input?: string): Promise<ScoreResult> {
		const results = await Promise.all(
			this.scorers.map(async ({ scorer, weight }) => ({
				result: await scorer.score(output, expected, input),
				weight,
			})),
		);

		const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
		const weightedSum = results.reduce((sum, r) => sum + r.result.value * r.weight, 0);
		const value = totalWeight > 0 ? weightedSum / totalWeight : 0;

		const reasons = results
			.map((r) => `${r.result.scorerName}: ${r.result.value.toFixed(2)} (w=${r.weight})`)
			.join("; ");

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			reason: reasons,
			metadata: {
				componentScores: results.map((r) => ({
					scorer: r.result.scorerName,
					value: r.result.value,
					weight: r.weight,
				})),
			},
		};
	}
}
