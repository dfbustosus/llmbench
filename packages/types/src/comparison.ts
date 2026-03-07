export interface ComparisonResult {
	runIdA: string;
	runIdB: string;
	scorerComparisons: ScorerComparison[];
	costComparison: CostComparison;
	latencyComparison: LatencyComparison;
	regressions: Regression[];
}

export interface ScorerComparison {
	scorerName: string;
	avgScoreA: number;
	avgScoreB: number;
	delta: number;
	percentChange: number;
}

export interface CostComparison {
	totalCostA: number;
	totalCostB: number;
	delta: number;
	percentChange: number;
}

export interface LatencyComparison {
	avgLatencyA: number;
	avgLatencyB: number;
	delta: number;
	percentChange: number;
}

export interface Regression {
	testCaseId: string;
	scorerName: string;
	scoreA: number;
	scoreB: number;
	delta: number;
	severity: "low" | "medium" | "high";
}

export interface RegressionReport {
	comparison: ComparisonResult;
	totalRegressions: number;
	highSeverityCount: number;
	summary: string;
}
