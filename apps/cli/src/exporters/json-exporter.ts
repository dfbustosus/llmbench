import type { ComparisonResult } from "@llmbench/types";
import type { EvalExportData, RunExportData } from "./index.js";

export function exportRunToJson(data: RunExportData): string {
	const resultsWithScores = data.results.map((result) => {
		const resultScores = data.scores.get(result.id) ?? [];
		return {
			...result,
			scores: resultScores,
		};
	});

	const output = {
		run: data.run,
		scorerAverages: data.scorerAverages,
		results: resultsWithScores,
	};

	return JSON.stringify(output, null, 2);
}

export function exportCompareToJson(data: { result: ComparisonResult }): string {
	return JSON.stringify(data.result, null, 2);
}

export function exportEvalToJson(data: EvalExportData): string {
	const output: Record<string, unknown> = {
		prompt: data.prompt,
		...(data.expected !== undefined ? { expected: data.expected } : {}),
		results: data.results.map((r) => ({
			provider: r.provider,
			model: r.model,
			output: r.output,
			latencyMs: r.latencyMs,
			tokens: r.tokens,
			cost: r.cost,
			...(r.scores.length > 0 ? { scores: r.scores } : {}),
			...(r.error ? { error: r.error } : {}),
		})),
	};
	return JSON.stringify(output, null, 2);
}
