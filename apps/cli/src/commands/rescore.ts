import { resolve } from "node:path";
import type { CreateScorerOptions } from "@llmbench/core";
import {
	computeScorerAverages,
	createProvider,
	createScorer,
	EventPersister,
	loadConfig,
	mergeWithDefaults,
	RescoringEngine,
} from "@llmbench/core";
import {
	createDB,
	EvalResultRepository,
	EvalRunRepository,
	EventRepository,
	initializeDB,
	ScoreRepository,
	TestCaseRepository,
} from "@llmbench/db";
import type { IScorer, ScorerConfig, TestCase } from "@llmbench/types";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { exportRun } from "../exporters/index.js";
import { renderResultsTable } from "../renderers/results-table.js";

function collect(value: string, prev: string[]): string[] {
	return prev.concat([value]);
}

export const rescoreCommand = new Command("rescore")
	.description("Re-score an existing evaluation run with new scorers (no provider re-calls)")
	.requiredOption("-r, --run-id <id>", "Run ID to rescore")
	.option("-s, --scorer <type>", "Scorer type (repeatable)", collect, [])
	.option("-c, --config <path>", "Path to config file (uses its scorers)")
	.option("--json", "Output results as JSON")
	.option("-o, --output <file>", "Export results to file (.json, .csv, .html)")
	.action(async (options) => {
		const isJson = !!options.json;
		const spinner = isJson ? null : ora("Loading run...").start();

		try {
			// 1. Open database
			const config = mergeWithDefaults(await loadConfig(options.config));
			const db = createDB(config.dbPath);
			initializeDB(db);

			const evalRunRepo = new EvalRunRepository(db);
			const evalResultRepo = new EvalResultRepository(db);
			const scoreRepo = new ScoreRepository(db);
			const testCaseRepo = new TestCaseRepository(db);

			// 2. Load and validate run
			const run = await evalRunRepo.findById(options.runId);
			if (!run) {
				throw new Error(`Run "${options.runId}" not found`);
			}
			if (run.status !== "completed" && run.status !== "failed") {
				throw new Error(
					`Run "${options.runId}" has status "${run.status}". ` +
						"Only completed or failed runs can be rescored.",
				);
			}

			// 3. Resolve scorer configs
			const scorerConfigs = resolveScorerConfigs(
				options.scorer,
				config.scorers,
				run.config.scorerConfigs,
			);

			if (spinner) {
				const names = scorerConfigs.map((s) => s.name).join(", ");
				spinner.text = `Rescoring with: ${names}`;
			}

			// 4. Create scorer instances
			const providersByName = new Map(config.providers.map((pc) => [pc.name, createProvider(pc)]));
			const scorers: IScorer[] = scorerConfigs.map((sc) => {
				const scorerOpts: CreateScorerOptions = {};
				const providerName = sc.options?.provider as string | undefined;
				if (providerName && providersByName.has(providerName)) {
					scorerOpts.provider = providersByName.get(providerName);
				} else if (providersByName.size > 0) {
					scorerOpts.provider = providersByName.values().next().value;
				}
				return createScorer(sc, scorerOpts);
			});

			// 5. Build test case map for assertion support
			const results = await evalResultRepo.findByRunId(run.id);
			const testCaseMap = new Map<string, TestCase>();
			const uniqueTestCaseIds = [...new Set(results.map((r) => r.testCaseId))];
			for (const id of uniqueTestCaseIds) {
				const tc = await testCaseRepo.findById(id);
				if (tc) testCaseMap.set(id, tc);
			}

			// 6. Run rescoring engine
			const engine = new RescoringEngine({
				scorers,
				evalRunRepo,
				evalResultRepo,
				scoreRepo,
			});

			// Wire event persistence for real-time dashboard
			const eventRepo = new EventRepository(db);
			const persister = new EventPersister(eventRepo);
			engine.onEvent(persister.handler());

			let lastProgress = 0;
			engine.onEvent((event) => {
				if (event.type === "rescore:progress" && spinner) {
					const pct = Math.round((event.completedResults / event.totalResults) * 100);
					if (pct > lastProgress) {
						lastProgress = pct;
						spinner.text = `Rescoring... ${pct}% (${event.completedResults}/${event.totalResults})`;
					}
				}
			});

			const engineResult = await engine.execute(run.id, testCaseMap, scorerConfigs);
			if (spinner) spinner.succeed("Rescoring complete!");

			// 7. Collect final results
			const finalResults = await evalResultRepo.findByRunId(run.id);
			const scoresByResult = await scoreRepo.findByRunId(run.id);
			const allScores = new Map(Object.entries(scoresByResult));
			const finalRun = await evalRunRepo.findById(run.id);
			const scorerAvgs = computeScorerAverages(scoresByResult);

			// 8. Output
			if (isJson) {
				console.log(
					JSON.stringify(
						{
							runId: run.id,
							status: finalRun?.status,
							totalResults: engineResult.totalResults,
							scoredResults: engineResult.scoredResults,
							failedResults: engineResult.failedResults,
							scores: scorerAvgs,
						},
						null,
						2,
					),
				);
			} else {
				renderResultsTable(finalResults, allScores);

				console.log();
				console.log(chalk.bold("Rescore Summary:"));
				console.log(`  Run ID: ${chalk.cyan(run.id)}`);
				console.log(`  Total results: ${engineResult.totalResults}`);
				console.log(`  Scored: ${chalk.green(String(engineResult.scoredResults))}`);
				if (engineResult.failedResults > 0) {
					console.log(`  Failed: ${chalk.red(String(engineResult.failedResults))}`);
				}

				if (Object.keys(scorerAvgs).length > 0) {
					console.log();
					console.log(chalk.bold("Scorer Averages:"));
					for (const [name, avg] of Object.entries(scorerAvgs)) {
						const color = avg >= 0.8 ? chalk.green : avg >= 0.5 ? chalk.yellow : chalk.red;
						console.log(`  ${name}: ${color(avg.toFixed(4))}`);
					}
				}
			}

			// 9. Export if requested
			if (options.output) {
				const outputPath = resolve(process.cwd(), options.output);
				exportRun(outputPath, {
					results: finalResults,
					scores: allScores,
					run: finalRun ?? run,
					scorerAverages: scorerAvgs,
				});
				if (!isJson) {
					console.log(chalk.green(`\nResults exported to ${outputPath}`));
				}
			}
		} catch (error) {
			if (spinner) spinner.fail("Rescoring failed");
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

/**
 * Resolves scorer configs from CLI flags, config file, or original run config.
 *
 * Priority: CLI --scorer flags > config file scorers > original run scorers.
 */
function resolveScorerConfigs(
	cliScorers: string[],
	configScorers: ScorerConfig[],
	runScorers: ScorerConfig[],
): ScorerConfig[] {
	// CLI --scorer flags take highest priority
	if (cliScorers.length > 0) {
		return cliScorers.map((type) => ({
			id: type,
			name: type
				.split("-")
				.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
				.join(" "),
			type: type as ScorerConfig["type"],
		}));
	}

	// Config file scorers (when --config is explicitly provided)
	if (configScorers.length > 0) {
		return configScorers;
	}

	// Fall back to the run's original scorer configs
	return runScorers;
}
