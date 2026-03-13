import type { ComparisonResult } from "@llmbench/types";
import type { EvalExportData, RunExportData } from "./index.js";

export function escapeCsvField(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	const str = String(value);
	if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

export function toCsvRow(fields: unknown[]): string {
	return fields.map(escapeCsvField).join(",");
}

export function exportRunToCsv(data: RunExportData): string {
	const lines: string[] = [];

	// Collect scorer names
	const scorerNames = new Set<string>();
	for (const scoreList of data.scores.values()) {
		for (const s of scoreList) {
			scorerNames.add(s.scorerName);
		}
	}
	const scorerCols = [...scorerNames];

	// Header
	lines.push(
		toCsvRow([
			"#",
			"Input",
			"Expected",
			"Output",
			"Error",
			"LatencyMs",
			"InputTokens",
			"OutputTokens",
			"TotalTokens",
			"Cost",
			...scorerCols,
		]),
	);

	// Data rows
	data.results.forEach((result, i) => {
		const resultScores = data.scores.get(result.id) ?? [];
		const scoreValues = scorerCols.map((name) => {
			const s = resultScores.find((sc) => sc.scorerName === name);
			return s ? s.value.toFixed(4) : "";
		});

		lines.push(
			toCsvRow([
				i + 1,
				result.input,
				result.expected,
				result.error ? "" : result.output,
				result.error ?? "",
				result.latencyMs.toFixed(0),
				result.tokenUsage.inputTokens,
				result.tokenUsage.outputTokens,
				result.tokenUsage.totalTokens,
				result.cost != null ? result.cost.toFixed(6) : "",
				...scoreValues,
			]),
		);
	});

	// Summary section
	lines.push("");
	lines.push(toCsvRow(["Summary"]));
	lines.push(toCsvRow(["Status", data.run.status]));
	lines.push(toCsvRow(["TotalCases", data.run.totalCases]));
	lines.push(toCsvRow(["Completed", data.run.completedCases]));
	lines.push(toCsvRow(["Failed", data.run.failedCases]));
	if (data.run.totalCost != null) {
		lines.push(toCsvRow(["TotalCost", data.run.totalCost.toFixed(6)]));
	}
	if (data.run.avgLatencyMs != null) {
		lines.push(toCsvRow(["AvgLatencyMs", data.run.avgLatencyMs.toFixed(0)]));
	}

	// Scorer averages
	if (Object.keys(data.scorerAverages).length > 0) {
		lines.push("");
		lines.push(toCsvRow(["Scorer Averages"]));
		for (const [name, avg] of Object.entries(data.scorerAverages)) {
			lines.push(toCsvRow([name, avg.toFixed(4)]));
		}
	}

	return lines.join("\n");
}

export function exportCompareToCsv(data: { result: ComparisonResult }): string {
	const lines: string[] = [];
	const { result } = data;

	// Score comparisons
	lines.push(toCsvRow(["Score Comparisons"]));
	lines.push(toCsvRow(["Scorer", "Run A", "Run B", "Delta", "Change%"]));
	for (const sc of result.scorerComparisons) {
		lines.push(
			toCsvRow([
				sc.scorerName,
				sc.avgScoreA.toFixed(4),
				sc.avgScoreB.toFixed(4),
				sc.delta.toFixed(4),
				sc.percentChange.toFixed(1),
			]),
		);
	}

	// Cost comparison
	lines.push("");
	lines.push(toCsvRow(["Cost Comparison"]));
	lines.push(toCsvRow(["Run A", "Run B", "Delta", "Change%"]));
	lines.push(
		toCsvRow([
			result.costComparison.totalCostA.toFixed(6),
			result.costComparison.totalCostB.toFixed(6),
			result.costComparison.delta.toFixed(6),
			result.costComparison.percentChange.toFixed(1),
		]),
	);

	// Latency comparison
	lines.push("");
	lines.push(toCsvRow(["Latency Comparison"]));
	lines.push(toCsvRow(["Run A (ms)", "Run B (ms)", "Delta (ms)", "Change%"]));
	lines.push(
		toCsvRow([
			result.latencyComparison.avgLatencyA.toFixed(0),
			result.latencyComparison.avgLatencyB.toFixed(0),
			result.latencyComparison.delta.toFixed(0),
			result.latencyComparison.percentChange.toFixed(1),
		]),
	);

	// Regressions
	if (result.regressions.length > 0) {
		lines.push("");
		lines.push(toCsvRow(["Regressions"]));
		lines.push(toCsvRow(["TestCaseId", "Scorer", "ScoreA", "ScoreB", "Delta", "Severity"]));
		for (const reg of result.regressions) {
			lines.push(
				toCsvRow([
					reg.testCaseId,
					reg.scorerName,
					reg.scoreA.toFixed(4),
					reg.scoreB.toFixed(4),
					reg.delta.toFixed(4),
					reg.severity,
				]),
			);
		}
	}

	return lines.join("\n");
}

export function exportEvalToCsv(data: EvalExportData): string {
	const lines: string[] = [];

	// Metadata header
	lines.push(toCsvRow(["Prompt", data.prompt]));
	if (data.expected !== undefined) {
		lines.push(toCsvRow(["Expected", data.expected]));
	}
	lines.push("");

	// Collect scorer names
	const scorerNames = new Set<string>();
	for (const r of data.results) {
		for (const s of r.scores) {
			scorerNames.add(s.scorer);
		}
	}
	const scorerCols = [...scorerNames];

	// Header
	lines.push(
		toCsvRow([
			"Provider",
			"Model",
			"Output",
			"Error",
			"LatencyMs",
			"InputTokens",
			"OutputTokens",
			"TotalTokens",
			"Cost",
			...scorerCols,
		]),
	);

	// Data rows
	for (const r of data.results) {
		const scoreValues = scorerCols.map((name) => {
			const s = r.scores.find((sc) => sc.scorer === name);
			return s ? s.value.toFixed(4) : "";
		});

		lines.push(
			toCsvRow([
				r.provider,
				r.model,
				r.error ? "" : r.output,
				r.error ?? "",
				r.latencyMs.toFixed(0),
				r.tokens.input,
				r.tokens.output,
				r.tokens.total,
				r.cost != null ? r.cost.toFixed(6) : "",
				...scoreValues,
			]),
		);
	}

	return lines.join("\n");
}
