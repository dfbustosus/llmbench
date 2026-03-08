import { DEFAULT_CONFIG, RunComparator, ThresholdGate } from "@llmbench/core";
import {
	createDB,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	ScoreRepository,
} from "@llmbench/db";
import type { GateResult } from "@llmbench/types";
import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";

export const compareCommand = new Command("compare")
	.description("Compare two evaluation runs")
	.argument("<runIdA>", "First run ID")
	.argument("<runIdB>", "Second run ID")
	.option("--db <path>", "Database path")
	.option("--fail-on-regression", "Exit 1 if regressions are detected")
	.option(
		"--min-severity <severity>",
		"Minimum regression severity to trigger failure (low, medium, high)",
		"low",
	)
	.option("--json", "Output results as JSON (for CI pipelines)")
	.action(async (runIdA: string, runIdB: string, options) => {
		const isJson = !!options.json;

		try {
			const dbPath = options.db || DEFAULT_CONFIG.dbPath || "./llmbench.db";
			const db = createDB(dbPath);
			initializeDB(db);

			const evalRunRepo = new EvalRunRepository(db);
			const evalResultRepo = new EvalResultRepository(db);
			const scoreRepo = new ScoreRepository(db);

			const comparator = new RunComparator(evalRunRepo, evalResultRepo, scoreRepo);
			const result = await comparator.compare(runIdA, runIdB);

			// Evaluate regression gate
			let gateResult: GateResult | null = null;
			if (options.failOnRegression) {
				const severity = options.minSeverity as "low" | "medium" | "high";
				if (!["low", "medium", "high"].includes(severity)) {
					throw new Error("--min-severity must be one of: low, medium, high");
				}
				const gate = new ThresholdGate({});
				gateResult = gate.evaluateComparison(result, severity);
			}

			if (isJson) {
				const output = {
					...result,
					...(gateResult ? { gate: gateResult } : {}),
				};
				console.log(JSON.stringify(output, null, 2));
			} else {
				// Score comparisons
				console.log(chalk.bold("\nScore Comparisons:"));
				const scoreTable = new Table({
					head: ["Scorer", "Run A", "Run B", "Delta", "Change"],
					style: { head: ["cyan"] },
				});

				for (const sc of result.scorerComparisons) {
					const deltaColor = sc.delta > 0 ? chalk.green : sc.delta < 0 ? chalk.red : chalk.dim;
					scoreTable.push([
						sc.scorerName,
						sc.avgScoreA.toFixed(3),
						sc.avgScoreB.toFixed(3),
						deltaColor(sc.delta.toFixed(3)),
						deltaColor(`${sc.percentChange > 0 ? "+" : ""}${sc.percentChange.toFixed(1)}%`),
					]);
				}
				console.log(scoreTable.toString());

				// Cost comparison
				console.log(chalk.bold("\nCost Comparison:"));
				const costDelta = result.costComparison.delta;
				const costColor = costDelta < 0 ? chalk.green : costDelta > 0 ? chalk.red : chalk.dim;
				console.log(`  Run A: $${result.costComparison.totalCostA.toFixed(4)}`);
				console.log(`  Run B: $${result.costComparison.totalCostB.toFixed(4)}`);
				console.log(
					`  Delta: ${costColor(`$${costDelta.toFixed(4)} (${result.costComparison.percentChange.toFixed(1)}%)`)}`,
				);

				// Latency comparison
				console.log(chalk.bold("\nLatency Comparison:"));
				const latDelta = result.latencyComparison.delta;
				const latColor = latDelta < 0 ? chalk.green : latDelta > 0 ? chalk.red : chalk.dim;
				console.log(`  Run A: ${result.latencyComparison.avgLatencyA.toFixed(0)}ms`);
				console.log(`  Run B: ${result.latencyComparison.avgLatencyB.toFixed(0)}ms`);
				console.log(
					`  Delta: ${latColor(`${latDelta.toFixed(0)}ms (${result.latencyComparison.percentChange.toFixed(1)}%)`)}`,
				);

				// Regressions
				if (result.regressions.length > 0) {
					console.log(chalk.bold.red(`\nRegressions (${result.regressions.length}):`));
					const regTable = new Table({
						head: ["Test Case", "Scorer", "Score A", "Score B", "Delta", "Severity"],
						style: { head: ["red"] },
					});

					for (const reg of result.regressions) {
						const sevColor =
							reg.severity === "high"
								? chalk.red
								: reg.severity === "medium"
									? chalk.yellow
									: chalk.dim;
						regTable.push([
							reg.testCaseId.slice(0, 8),
							reg.scorerName,
							reg.scoreA.toFixed(3),
							reg.scoreB.toFixed(3),
							chalk.red(reg.delta.toFixed(3)),
							sevColor(reg.severity),
						]);
					}
					console.log(regTable.toString());
				} else {
					console.log(chalk.green("\nNo regressions detected!"));
				}

				// Gate result display
				if (gateResult && !gateResult.passed) {
					console.log();
					console.log(chalk.bold.red("CI Gate: FAILED"));
					for (const v of gateResult.violations) {
						console.log(chalk.red(`  ✗ ${v.message}`));
					}
				} else if (gateResult) {
					console.log();
					console.log(chalk.bold.green("CI Gate: PASSED"));
				}
			}

			if (gateResult && !gateResult.passed) {
				process.exit(1);
			}
		} catch (error) {
			if (isJson) {
				console.log(
					JSON.stringify(
						{ error: error instanceof Error ? error.message : String(error) },
						null,
						2,
					),
				);
			} else {
				console.error(chalk.red(error instanceof Error ? error.message : String(error)));
			}
			process.exit(1);
		}
	});
