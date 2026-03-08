import type {
	CIGateConfig,
	ComparisonResult,
	EvalRun,
	GateResult,
	GateViolation,
	ScoreResult,
} from "@llmbench/types";

const SEVERITY_ORDER: Record<string, number> = { low: 0, medium: 1, high: 2 };

export class ThresholdGate {
	constructor(private config: CIGateConfig) {}

	evaluateRun(run: EvalRun, scores: Map<string, ScoreResult[]>): GateResult {
		const violations: GateViolation[] = [];

		if (this.config.minScore !== undefined) {
			const avgScore = this.computeOverallAverage(scores);
			if (avgScore < this.config.minScore) {
				violations.push({
					gate: "minScore",
					threshold: this.config.minScore,
					actual: avgScore,
					message: `Average score ${avgScore.toFixed(3)} is below threshold ${this.config.minScore.toFixed(3)}`,
				});
			}
		}

		if (this.config.maxFailureRate !== undefined) {
			const failureRate = run.totalCases > 0 ? run.failedCases / run.totalCases : 0;
			if (failureRate > this.config.maxFailureRate) {
				violations.push({
					gate: "maxFailureRate",
					threshold: this.config.maxFailureRate,
					actual: failureRate,
					message: `Failure rate ${(failureRate * 100).toFixed(1)}% exceeds threshold ${(this.config.maxFailureRate * 100).toFixed(1)}%`,
				});
			}
		}

		if (this.config.maxCost !== undefined) {
			const totalCost = run.totalCost ?? 0;
			if (totalCost > this.config.maxCost) {
				violations.push({
					gate: "maxCost",
					threshold: this.config.maxCost,
					actual: totalCost,
					message: `Total cost $${totalCost.toFixed(4)} exceeds budget $${this.config.maxCost.toFixed(4)}`,
				});
			}
		}

		if (this.config.maxLatencyMs !== undefined) {
			const avgLatency = run.avgLatencyMs ?? 0;
			if (avgLatency > this.config.maxLatencyMs) {
				violations.push({
					gate: "maxLatencyMs",
					threshold: this.config.maxLatencyMs,
					actual: avgLatency,
					message: `Average latency ${avgLatency.toFixed(0)}ms exceeds threshold ${this.config.maxLatencyMs}ms`,
				});
			}
		}

		if (this.config.scorerThresholds) {
			const scorerAverages = this.computeScorerAverages(scores);
			for (const [scorerName, threshold] of Object.entries(this.config.scorerThresholds)) {
				const avg = scorerAverages.get(scorerName);
				if (avg === undefined) continue;
				if (avg < threshold) {
					violations.push({
						gate: `scorer:${scorerName}`,
						threshold,
						actual: avg,
						message: `Scorer "${scorerName}" average ${avg.toFixed(3)} is below threshold ${threshold.toFixed(3)}`,
					});
				}
			}
		}

		return { passed: violations.length === 0, violations };
	}

	evaluateComparison(
		comparison: ComparisonResult,
		minSeverity: "low" | "medium" | "high" = "low",
	): GateResult {
		const minSevNum = SEVERITY_ORDER[minSeverity];
		const filteredRegressions = comparison.regressions.filter(
			(r) => SEVERITY_ORDER[r.severity] >= minSevNum,
		);

		if (filteredRegressions.length === 0) {
			return { passed: true, violations: [] };
		}

		const highCount = filteredRegressions.filter((r) => r.severity === "high").length;
		const mediumCount = filteredRegressions.filter((r) => r.severity === "medium").length;
		const lowCount = filteredRegressions.filter((r) => r.severity === "low").length;

		const parts: string[] = [];
		if (highCount > 0) parts.push(`${highCount} high`);
		if (mediumCount > 0) parts.push(`${mediumCount} medium`);
		if (lowCount > 0) parts.push(`${lowCount} low`);

		return {
			passed: false,
			violations: [
				{
					gate: "regression",
					threshold: 0,
					actual: filteredRegressions.length,
					message: `${filteredRegressions.length} regression(s) detected (${parts.join(", ")})`,
				},
			],
		};
	}

	private computeOverallAverage(scores: Map<string, ScoreResult[]>): number {
		let totalSum = 0;
		let totalCount = 0;
		for (const scoreList of scores.values()) {
			for (const score of scoreList) {
				totalSum += score.value;
				totalCount++;
			}
		}
		return totalCount > 0 ? totalSum / totalCount : 0;
	}

	private computeScorerAverages(scores: Map<string, ScoreResult[]>): Map<string, number> {
		const totals = new Map<string, { sum: number; count: number }>();
		for (const scoreList of scores.values()) {
			for (const score of scoreList) {
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
}
