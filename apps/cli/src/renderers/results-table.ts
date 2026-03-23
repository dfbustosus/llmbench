import type { EvalResult, ScoreResult } from "@llmbench/types";
import chalk from "chalk";
import Table from "cli-table3";

export function renderResultsTable(
	results: EvalResult[],
	scores: Map<string, ScoreResult[]>,
): void {
	if (results.length === 0) {
		console.log(chalk.dim("\nNo results to display."));
		return;
	}

	// Get all scorer names
	const scorerNames = new Set<string>();
	for (const scoreList of scores.values()) {
		for (const s of scoreList) {
			scorerNames.add(s.scorerName);
		}
	}

	const hasTtft = results.some((r) => r.timeToFirstTokenMs != null);
	const head = [
		"#",
		"Input",
		"Expected",
		"Output",
		...scorerNames,
		"Latency",
		...(hasTtft ? ["TTFT"] : []),
		"Cost",
	];

	const table = new Table({
		head: head.map((h) => chalk.cyan(h)),
		colWidths: [
			4,
			30,
			20,
			30,
			...Array.from(scorerNames).map(() => 12),
			10,
			...(hasTtft ? [8] : []),
			10,
		],
		wordWrap: true,
	});

	const truncate = (s: string, len: number) => (s.length > len ? `${s.slice(0, len - 3)}...` : s);

	results.forEach((result, i) => {
		const resultScores = scores.get(result.id) ?? [];
		const scoreValues = Array.from(scorerNames).map((name) => {
			const s = resultScores.find((sc) => sc.scorerName === name);
			if (!s) return chalk.dim("-");
			const color = s.value >= 0.8 ? chalk.green : s.value >= 0.5 ? chalk.yellow : chalk.red;
			return color(s.value.toFixed(2));
		});

		table.push([
			String(i + 1),
			truncate(result.input, 27),
			truncate(result.expected, 17),
			result.error ? chalk.red(truncate(result.error, 27)) : truncate(result.output, 27),
			...scoreValues,
			`${result.latencyMs.toFixed(0)}ms`,
			...(hasTtft
				? [result.timeToFirstTokenMs != null ? `${result.timeToFirstTokenMs.toFixed(0)}ms` : "-"]
				: []),
			result.cost ? `$${result.cost.toFixed(4)}` : "-",
		]);
	});

	console.log(chalk.bold("\nResults:"));
	console.log(table.toString());

	// Print full error details below the table
	const errors = results.filter((r) => r.error);
	if (errors.length > 0) {
		console.log(chalk.bold.red("\nErrors:"));
		for (const r of errors) {
			console.log(chalk.red(`  [${truncate(r.input, 40)}]`));
			console.log(chalk.dim(`    ${r.error}`));
		}
	}
}
