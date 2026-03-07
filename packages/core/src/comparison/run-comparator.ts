import type { EvalResultRepository, EvalRunRepository, ScoreRepository } from "@llmbench/db";
import type {
	ComparisonResult,
	CostComparison,
	EvalResult,
	LatencyComparison,
	Regression,
	ScoreResult,
	ScorerComparison,
} from "@llmbench/types";

export class RunComparator {
	constructor(
		private evalRunRepo: EvalRunRepository,
		private evalResultRepo: EvalResultRepository,
		private scoreRepo: ScoreRepository,
	) {}

	async compare(runIdA: string, runIdB: string): Promise<ComparisonResult> {
		const [runA, runB] = await Promise.all([
			this.evalRunRepo.findById(runIdA),
			this.evalRunRepo.findById(runIdB),
		]);

		if (!runA || !runB) {
			throw new Error("One or both runs not found");
		}

		const [resultsA, resultsB] = await Promise.all([
			this.evalResultRepo.findByRunId(runIdA),
			this.evalResultRepo.findByRunId(runIdB),
		]);

		const [scoresA, scoresB] = await Promise.all([
			this.getAllScores(resultsA),
			this.getAllScores(resultsB),
		]);

		const scorerComparisons = this.compareScorerAverages(scoresA, scoresB);
		const costComparison = this.compareCosts(runA.totalCost ?? 0, runB.totalCost ?? 0);
		const latencyComparison = this.compareLatency(runA.avgLatencyMs ?? 0, runB.avgLatencyMs ?? 0);
		const regressions = this.detectRegressions(resultsA, resultsB, scoresA, scoresB);

		return {
			runIdA,
			runIdB,
			scorerComparisons,
			costComparison,
			latencyComparison,
			regressions,
		};
	}

	private async getAllScores(results: EvalResult[]): Promise<Map<string, ScoreResult[]>> {
		const map = new Map<string, ScoreResult[]>();
		for (const result of results) {
			const scores = await this.scoreRepo.findByResultId(result.id);
			map.set(result.id, scores);
		}
		return map;
	}

	private compareScorerAverages(
		scoresA: Map<string, ScoreResult[]>,
		scoresB: Map<string, ScoreResult[]>,
	): ScorerComparison[] {
		const avgA = this.averageByScorer(scoresA);
		const avgB = this.averageByScorer(scoresB);

		const scorerNames = new Set([...avgA.keys(), ...avgB.keys()]);
		const comparisons: ScorerComparison[] = [];

		for (const name of scorerNames) {
			const a = avgA.get(name) ?? 0;
			const b = avgB.get(name) ?? 0;
			const delta = b - a;
			const percentChange = a !== 0 ? (delta / a) * 100 : 0;

			comparisons.push({ scorerName: name, avgScoreA: a, avgScoreB: b, delta, percentChange });
		}

		return comparisons;
	}

	private averageByScorer(allScores: Map<string, ScoreResult[]>): Map<string, number> {
		const totals = new Map<string, { sum: number; count: number }>();

		for (const scores of allScores.values()) {
			for (const score of scores) {
				const existing = totals.get(score.scorerName) ?? { sum: 0, count: 0 };
				existing.sum += score.value;
				existing.count++;
				totals.set(score.scorerName, existing);
			}
		}

		const averages = new Map<string, number>();
		for (const [name, { sum, count }] of totals) {
			averages.set(name, count > 0 ? sum / count : 0);
		}
		return averages;
	}

	private compareCosts(costA: number, costB: number): CostComparison {
		const delta = costB - costA;
		const percentChange = costA !== 0 ? (delta / costA) * 100 : 0;
		return { totalCostA: costA, totalCostB: costB, delta, percentChange };
	}

	private compareLatency(latA: number, latB: number): LatencyComparison {
		const delta = latB - latA;
		const percentChange = latA !== 0 ? (delta / latA) * 100 : 0;
		return { avgLatencyA: latA, avgLatencyB: latB, delta, percentChange };
	}

	private detectRegressions(
		resultsA: EvalResult[],
		resultsB: EvalResult[],
		scoresA: Map<string, ScoreResult[]>,
		scoresB: Map<string, ScoreResult[]>,
	): Regression[] {
		const regressions: Regression[] = [];

		// Match results by testCaseId
		const resultMapB = new Map<string, EvalResult>();
		for (const r of resultsB) {
			resultMapB.set(r.testCaseId, r);
		}

		for (const resultA of resultsA) {
			const resultB = resultMapB.get(resultA.testCaseId);
			if (!resultB) continue;

			const scA = scoresA.get(resultA.id) ?? [];
			const scB = scoresB.get(resultB.id) ?? [];

			for (const scoreA of scA) {
				const scoreB = scB.find((s) => s.scorerName === scoreA.scorerName);
				if (!scoreB) continue;

				const delta = scoreB.value - scoreA.value;
				if (delta < -0.05) {
					const severity = delta < -0.3 ? "high" : delta < -0.15 ? "medium" : "low";

					regressions.push({
						testCaseId: resultA.testCaseId,
						scorerName: scoreA.scorerName,
						scoreA: scoreA.value,
						scoreB: scoreB.value,
						delta,
						severity,
					});
				}
			}
		}

		return regressions;
	}
}
