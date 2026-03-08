import type {
	ComparisonResult,
	EvalRun,
	Regression,
	ScoreResult,
	ScorerType,
} from "@llmbench/types";
import { describe, expect, it } from "vitest";
import { ThresholdGate } from "../gate/threshold-gate.js";

function makeRun(overrides: Partial<EvalRun> = {}): EvalRun {
	return {
		id: "run-1",
		projectId: "proj-1",
		datasetId: "ds-1",
		status: "completed",
		config: {
			providerIds: ["prov-1"],
			scorerConfigs: [],
			concurrency: 1,
			maxRetries: 0,
			timeoutMs: 5000,
		},
		totalCases: 10,
		completedCases: 10,
		failedCases: 0,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		...overrides,
	};
}

function makeScore(
	scorerName: string,
	value: number,
	scorerType: ScorerType = "exact-match",
): ScoreResult {
	return {
		scorerId: `scorer-${scorerName}`,
		scorerName,
		scorerType,
		value,
	};
}

function makeScoresMap(entries: Array<[string, ScoreResult[]]>): Map<string, ScoreResult[]> {
	return new Map(entries);
}

function makeComparison(regressions: Regression[]): ComparisonResult {
	return {
		runIdA: "run-a",
		runIdB: "run-b",
		scorerComparisons: [],
		costComparison: { totalCostA: 0, totalCostB: 0, delta: 0, percentChange: 0 },
		latencyComparison: { avgLatencyA: 0, avgLatencyB: 0, delta: 0, percentChange: 0 },
		regressions,
	};
}

describe("ThresholdGate", () => {
	describe("evaluateRun", () => {
		describe("minScore", () => {
			it("should pass when average score meets threshold", () => {
				const gate = new ThresholdGate({ minScore: 0.8 });
				const scores = makeScoresMap([
					["r1", [makeScore("Exact Match", 0.9)]],
					["r2", [makeScore("Exact Match", 0.8)]],
				]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(true);
				expect(result.violations).toHaveLength(0);
			});

			it("should fail when average score is below threshold", () => {
				const gate = new ThresholdGate({ minScore: 0.8 });
				const scores = makeScoresMap([
					["r1", [makeScore("Exact Match", 0.5)]],
					["r2", [makeScore("Exact Match", 0.6)]],
				]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(false);
				expect(result.violations).toHaveLength(1);
				expect(result.violations[0].gate).toBe("minScore");
				expect(result.violations[0].threshold).toBe(0.8);
				expect(result.violations[0].actual).toBeCloseTo(0.55);
			});

			it("should fail with score 0 when no scores exist", () => {
				const gate = new ThresholdGate({ minScore: 0.5 });
				const scores = makeScoresMap([]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(false);
				expect(result.violations[0].actual).toBe(0);
			});

			it("should pass when threshold is exactly met", () => {
				const gate = new ThresholdGate({ minScore: 0.75 });
				const scores = makeScoresMap([["r1", [makeScore("Exact Match", 0.75)]]]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(true);
			});
		});

		describe("maxFailureRate", () => {
			it("should pass when failure rate is within threshold", () => {
				const gate = new ThresholdGate({ maxFailureRate: 0.2 });
				const run = makeRun({ totalCases: 10, failedCases: 1 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});

			it("should fail when failure rate exceeds threshold", () => {
				const gate = new ThresholdGate({ maxFailureRate: 0.1 });
				const run = makeRun({ totalCases: 10, failedCases: 3 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(false);
				expect(result.violations).toHaveLength(1);
				expect(result.violations[0].gate).toBe("maxFailureRate");
				expect(result.violations[0].actual).toBeCloseTo(0.3);
			});

			it("should handle zero total cases without error", () => {
				const gate = new ThresholdGate({ maxFailureRate: 0.1 });
				const run = makeRun({ totalCases: 0, failedCases: 0 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});
		});

		describe("maxCost", () => {
			it("should pass when cost is within budget", () => {
				const gate = new ThresholdGate({ maxCost: 1.0 });
				const run = makeRun({ totalCost: 0.5 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});

			it("should fail when cost exceeds budget", () => {
				const gate = new ThresholdGate({ maxCost: 1.0 });
				const run = makeRun({ totalCost: 1.5 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(false);
				expect(result.violations[0].gate).toBe("maxCost");
				expect(result.violations[0].actual).toBe(1.5);
			});

			it("should pass when totalCost is undefined (treated as 0)", () => {
				const gate = new ThresholdGate({ maxCost: 1.0 });
				const run = makeRun({ totalCost: undefined });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});
		});

		describe("maxLatencyMs", () => {
			it("should pass when latency is within threshold", () => {
				const gate = new ThresholdGate({ maxLatencyMs: 500 });
				const run = makeRun({ avgLatencyMs: 300 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});

			it("should fail when latency exceeds threshold", () => {
				const gate = new ThresholdGate({ maxLatencyMs: 500 });
				const run = makeRun({ avgLatencyMs: 750 });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(false);
				expect(result.violations[0].gate).toBe("maxLatencyMs");
				expect(result.violations[0].actual).toBe(750);
			});

			it("should pass when avgLatencyMs is undefined (treated as 0)", () => {
				const gate = new ThresholdGate({ maxLatencyMs: 500 });
				const run = makeRun({ avgLatencyMs: undefined });
				const result = gate.evaluateRun(run, makeScoresMap([]));

				expect(result.passed).toBe(true);
			});
		});

		describe("scorerThresholds", () => {
			it("should pass when all scorer averages meet thresholds", () => {
				const gate = new ThresholdGate({
					scorerThresholds: { "Exact Match": 0.7, Contains: 0.9 },
				});
				const scores = makeScoresMap([
					["r1", [makeScore("Exact Match", 0.8), makeScore("Contains", 1.0, "contains")]],
					["r2", [makeScore("Exact Match", 0.7), makeScore("Contains", 0.9, "contains")]],
				]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(true);
			});

			it("should fail when a scorer average is below its threshold", () => {
				const gate = new ThresholdGate({
					scorerThresholds: { "Exact Match": 0.9 },
				});
				const scores = makeScoresMap([
					["r1", [makeScore("Exact Match", 0.5)]],
					["r2", [makeScore("Exact Match", 0.6)]],
				]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(false);
				expect(result.violations[0].gate).toBe("scorer:Exact Match");
				expect(result.violations[0].actual).toBeCloseTo(0.55);
			});

			it("should skip scorers that do not appear in results", () => {
				const gate = new ThresholdGate({
					scorerThresholds: { "Nonexistent Scorer": 0.5 },
				});
				const scores = makeScoresMap([["r1", [makeScore("Exact Match", 1.0)]]]);
				const result = gate.evaluateRun(makeRun(), scores);

				expect(result.passed).toBe(true);
			});
		});

		describe("multiple gates", () => {
			it("should report all violations when multiple gates fail", () => {
				const gate = new ThresholdGate({
					minScore: 0.9,
					maxFailureRate: 0.05,
					maxCost: 0.01,
				});
				const run = makeRun({
					totalCases: 10,
					failedCases: 3,
					totalCost: 0.5,
				});
				const scores = makeScoresMap([["r1", [makeScore("Exact Match", 0.5)]]]);
				const result = gate.evaluateRun(run, scores);

				expect(result.passed).toBe(false);
				expect(result.violations).toHaveLength(3);

				const gates = result.violations.map((v) => v.gate);
				expect(gates).toContain("minScore");
				expect(gates).toContain("maxFailureRate");
				expect(gates).toContain("maxCost");
			});
		});

		describe("empty config", () => {
			it("should always pass with no thresholds configured", () => {
				const gate = new ThresholdGate({});
				const run = makeRun({ failedCases: 10 });
				const scores = makeScoresMap([["r1", [makeScore("Exact Match", 0.0)]]]);
				const result = gate.evaluateRun(run, scores);

				expect(result.passed).toBe(true);
				expect(result.violations).toHaveLength(0);
			});
		});
	});

	describe("evaluateComparison", () => {
		it("should pass when there are no regressions", () => {
			const gate = new ThresholdGate({});
			const comparison = makeComparison([]);
			const result = gate.evaluateComparison(comparison);

			expect(result.passed).toBe(true);
			expect(result.violations).toHaveLength(0);
		});

		it("should fail when regressions exist with default severity", () => {
			const gate = new ThresholdGate({});
			const comparison = makeComparison([
				{
					testCaseId: "tc-1",
					scorerName: "Exact Match",
					scoreA: 1.0,
					scoreB: 0.5,
					delta: -0.5,
					severity: "high",
				},
			]);
			const result = gate.evaluateComparison(comparison);

			expect(result.passed).toBe(false);
			expect(result.violations).toHaveLength(1);
			expect(result.violations[0].gate).toBe("regression");
			expect(result.violations[0].actual).toBe(1);
			expect(result.violations[0].message).toContain("1 regression(s)");
			expect(result.violations[0].message).toContain("1 high");
		});

		it("should filter regressions by minimum severity", () => {
			const gate = new ThresholdGate({});
			const comparison = makeComparison([
				{
					testCaseId: "tc-1",
					scorerName: "Exact Match",
					scoreA: 1.0,
					scoreB: 0.9,
					delta: -0.1,
					severity: "low",
				},
				{
					testCaseId: "tc-2",
					scorerName: "Exact Match",
					scoreA: 1.0,
					scoreB: 0.7,
					delta: -0.3,
					severity: "medium",
				},
			]);

			const resultHigh = gate.evaluateComparison(comparison, "high");
			expect(resultHigh.passed).toBe(true);

			const resultMedium = gate.evaluateComparison(comparison, "medium");
			expect(resultMedium.passed).toBe(false);
			expect(resultMedium.violations[0].actual).toBe(1);

			const resultLow = gate.evaluateComparison(comparison, "low");
			expect(resultLow.passed).toBe(false);
			expect(resultLow.violations[0].actual).toBe(2);
		});

		it("should count severity categories correctly in message", () => {
			const gate = new ThresholdGate({});
			const comparison = makeComparison([
				{
					testCaseId: "tc-1",
					scorerName: "S",
					scoreA: 1.0,
					scoreB: 0.0,
					delta: -1.0,
					severity: "high",
				},
				{
					testCaseId: "tc-2",
					scorerName: "S",
					scoreA: 1.0,
					scoreB: 0.7,
					delta: -0.3,
					severity: "high",
				},
				{
					testCaseId: "tc-3",
					scorerName: "S",
					scoreA: 1.0,
					scoreB: 0.8,
					delta: -0.2,
					severity: "medium",
				},
				{
					testCaseId: "tc-4",
					scorerName: "S",
					scoreA: 1.0,
					scoreB: 0.9,
					delta: -0.1,
					severity: "low",
				},
			]);
			const result = gate.evaluateComparison(comparison);

			expect(result.passed).toBe(false);
			expect(result.violations[0].message).toContain("4 regression(s)");
			expect(result.violations[0].message).toContain("2 high");
			expect(result.violations[0].message).toContain("1 medium");
			expect(result.violations[0].message).toContain("1 low");
		});

		it("should pass with only low regressions when min severity is medium", () => {
			const gate = new ThresholdGate({});
			const comparison = makeComparison([
				{
					testCaseId: "tc-1",
					scorerName: "S",
					scoreA: 0.9,
					scoreB: 0.8,
					delta: -0.1,
					severity: "low",
				},
			]);
			const result = gate.evaluateComparison(comparison, "medium");

			expect(result.passed).toBe(true);
		});
	});
});
