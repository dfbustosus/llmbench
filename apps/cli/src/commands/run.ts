import { createHash } from "node:crypto";
import { resolve } from "node:path";
import {
	CacheManager,
	CostCalculator,
	computeScorerAverages,
	createProvider,
	createScorer,
	EvaluationEngine,
	EventPersister,
	loadConfig,
	loadDataset,
	mergeWithDefaults,
	ThresholdGate,
} from "@llmbench/core";
import {
	CacheRepository,
	CostRecordRepository,
	createDB,
	DatasetRepository,
	EvalResultRepository,
	EvalRunRepository,
	EventRepository,
	initializeDB,
	ProjectRepository,
	ProviderRepository,
	ScoreRepository,
	TestCaseRepository,
} from "@llmbench/db";
import type { CIGateConfig, EvalRun, GateResult, IScorer } from "@llmbench/types";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { exportRun } from "../exporters/index.js";
import { renderResultsTable } from "../renderers/results-table.js";

// Dataset validation is now handled by loadDataset() from @llmbench/core

function buildGateConfig(
	configGate: CIGateConfig | undefined,
	cliThreshold: string | undefined,
	cliMaxFailureRate: string | undefined,
): CIGateConfig | null {
	const hasConfigGate = configGate && Object.keys(configGate).length > 0;
	const hasCliFlags = cliThreshold !== undefined || cliMaxFailureRate !== undefined;

	if (!hasConfigGate && !hasCliFlags) return null;

	const gate: CIGateConfig = { ...configGate };

	if (cliThreshold !== undefined) {
		const value = Number(cliThreshold);
		if (Number.isNaN(value) || value < 0 || value > 1) {
			throw new Error("--threshold must be a number between 0 and 1");
		}
		gate.minScore = value;
	}

	if (cliMaxFailureRate !== undefined) {
		const value = Number(cliMaxFailureRate);
		if (Number.isNaN(value) || value < 0 || value > 1) {
			throw new Error("--max-failure-rate must be a number between 0 and 1");
		}
		gate.maxFailureRate = value;
	}

	return gate;
}

function canonicalize(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (Array.isArray(value)) return value.map(canonicalize);
	if (typeof value === "object") {
		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(value as Record<string, unknown>).sort()) {
			sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
		}
		return sorted;
	}
	return value;
}

function computeContentHash(
	testCases: Array<{
		input: string;
		expected: string;
		messages?: unknown;
		context?: Record<string, unknown>;
		tags?: string[];
		assert?: unknown;
	}>,
): string {
	const semantic = testCases.map((tc) => ({
		input: tc.input,
		expected: tc.expected,
		messages: tc.messages,
		context: tc.context,
		tags: tc.tags,
		assert: tc.assert,
	}));
	const canonical = JSON.stringify(canonicalize(semantic));
	return createHash("sha256").update(canonical).digest("hex");
}

export const runCommand = new Command("run")
	.description("Run an evaluation")
	.requiredOption("-d, --dataset <path>", "Path to dataset file (.json, .yaml, .yml)")
	.option("-c, --config <path>", "Path to config file")
	.option("--concurrency <number>", "Concurrency level", "5")
	.option("--tags <tags>", "Comma-separated tags")
	.option("--threshold <score>", "Minimum average score threshold (0-1); exits 1 on failure")
	.option("--max-failure-rate <rate>", "Maximum failure rate (0-1); exits 1 if exceeded")
	.option("--no-cache", "Disable response caching")
	.option("--clear-cache", "Clear cache before running")
	.option("--json", "Output results as JSON (for CI pipelines)")
	.option("-o, --output <file>", "Export results to file (.json, .csv, .html)")
	.action(async (options) => {
		const isJson = !!options.json;
		const spinner = isJson ? null : ora("Loading configuration...").start();

		try {
			const config = mergeWithDefaults(await loadConfig(options.config));
			if (spinner) spinner.text = "Initializing database...";

			const gateConfig = buildGateConfig(config.gate, options.threshold, options.maxFailureRate);

			const db = createDB(config.dbPath);
			initializeDB(db);

			const projectRepo = new ProjectRepository(db);
			const datasetRepo = new DatasetRepository(db);
			const testCaseRepo = new TestCaseRepository(db);
			const providerRepo = new ProviderRepository(db);
			const evalRunRepo = new EvalRunRepository(db);
			const evalResultRepo = new EvalResultRepository(db);
			const scoreRepo = new ScoreRepository(db);
			const costRecordRepo = new CostRecordRepository(db);
			const cacheRepo = new CacheRepository(db);

			// Handle --clear-cache
			if (options.clearCache) {
				const deleted = await cacheRepo.deleteAll();
				if (spinner) spinner.text = `Cleared ${deleted} cached responses`;
			}

			// Set up cache manager
			const cacheEnabled = options.cache !== false && config.cache?.enabled !== false;
			let cacheManager: CacheManager | undefined;
			if (cacheEnabled) {
				cacheManager = new CacheManager(cacheRepo, config.cache);
				// Clean up expired entries
				await cacheRepo.deleteExpired();
			}

			// Find or create project
			const projects = await projectRepo.findAll();
			let project = projects.find((p) => p.name === config.projectName);
			if (!project) {
				project = await projectRepo.create({
					name: config.projectName,
					description: config.description,
				});
			}

			// Load and validate dataset
			if (spinner) spinner.text = "Loading dataset...";
			const datasetPath = resolve(process.cwd(), options.dataset);
			const datasetJson = loadDataset(datasetPath);

			const datasetName = datasetJson.name || "Untitled Dataset";
			const incomingHash = computeContentHash(datasetJson.testCases);

			// Find all versions of this dataset by name
			const existingVersions = await datasetRepo.findByNameInProject(project.id, datasetName);

			// Legacy backfill: compute and store hash for datasets that lack one
			for (const ds of existingVersions) {
				if (!ds.contentHash) {
					const dbCases = await testCaseRepo.findByDatasetId(ds.id);
					const backfillHash = computeContentHash(dbCases);
					await datasetRepo.update(ds.id, { contentHash: backfillHash });
					ds.contentHash = backfillHash;
				}
			}

			// Check if any existing version matches the incoming hash
			let dataset = existingVersions.find((d) => d.contentHash === incomingHash);

			const createTestCases = async (datasetId: string) => {
				await testCaseRepo.createMany(
					datasetJson.testCases.map((tc, i) => ({
						datasetId,
						input: tc.input,
						expected: tc.expected,
						messages: tc.messages as
							| Array<{ role: "system" | "user" | "assistant"; content: string }>
							| undefined,
						context: tc.context,
						tags: tc.tags,
						assert: tc.assert,
						orderIndex: i,
					})),
				);
			};

			if (dataset) {
				// Unchanged (or reverted to a previous version)
				if (spinner) {
					spinner.text = `Dataset '${datasetName}' unchanged (v${dataset.version})`;
				}
			} else if (existingVersions.length === 0) {
				// Brand new dataset
				dataset = await datasetRepo.create({
					projectId: project.id,
					name: datasetName,
					description: datasetJson.description,
					contentHash: incomingHash,
					version: 1,
				});
				await createTestCases(dataset.id);
				if (spinner) {
					spinner.text = `Dataset '${datasetName}' created (v1)`;
				}
			} else {
				// Content changed — create new version
				const latestVersion = existingVersions[0].version;
				const newVersion = latestVersion + 1;
				dataset = await datasetRepo.create({
					projectId: project.id,
					name: datasetName,
					description: datasetJson.description,
					contentHash: incomingHash,
					version: newVersion,
				});
				await createTestCases(dataset.id);
				if (spinner) {
					spinner.text = `Dataset '${datasetName}' updated (v${latestVersion} → v${newVersion})`;
				}
			}

			const testCases = await testCaseRepo.findByDatasetId(dataset.id);

			// Create/find providers
			if (spinner) spinner.text = "Setting up providers...";

			if (config.providers.length === 0) {
				throw new Error("No providers configured. Add providers to your llmbench.config.ts");
			}

			const providerMap = new Map<string, ReturnType<typeof createProvider>>();
			const providerIds: string[] = [];

			for (const pc of config.providers) {
				let providerRecord = (await providerRepo.findByProjectId(project.id)).find(
					(p) => p.name === pc.name && p.model === pc.model,
				);
				if (!providerRecord) {
					providerRecord = await providerRepo.create({
						projectId: project.id,
						type: pc.type,
						name: pc.name,
						model: pc.model,
						config: pc,
					});
				}
				providerIds.push(providerRecord.id);
				providerMap.set(providerRecord.id, createProvider(pc));
			}

			// Create scorers using the factory
			const scorers: IScorer[] = config.scorers.map((sc) => createScorer(sc));

			// Create run
			if (spinner) spinner.text = "Starting evaluation...";
			const run = await evalRunRepo.create({
				projectId: project.id,
				datasetId: dataset.id,
				config: {
					providerIds,
					scorerConfigs: config.scorers,
					concurrency: Number(options.concurrency) || config.defaults?.concurrency || 5,
					maxRetries: config.defaults?.maxRetries || 3,
					timeoutMs: config.defaults?.timeoutMs || 30000,
				},
				totalCases: testCases.length * providerIds.length,
				tags: options.tags?.split(","),
				datasetVersion: dataset.version,
			});

			// Set up engine
			const engine = new EvaluationEngine({
				providers: providerMap,
				scorers,
				evalRunRepo,
				evalResultRepo,
				scoreRepo,
				costRecordRepo,
				costCalculator: new CostCalculator(),
				cacheManager,
			});

			// Wire event persistence for real-time dashboard
			const eventRepo = new EventRepository(db);
			const persister = new EventPersister(eventRepo);
			engine.onEvent(persister.handler());

			// Lazy cleanup of stale events from past runs
			eventRepo.deleteStale();

			// Listen to events for progress
			let lastProgress = 0;
			engine.onEvent((event) => {
				if (event.type === "run:progress" && spinner) {
					const pct = Math.round((event.completedCases / event.totalCases) * 100);
					if (pct > lastProgress) {
						lastProgress = pct;
						spinner.text = `Running evaluation... ${pct}% (${event.completedCases}/${event.totalCases})`;
					}
				}
			});

			// Set up cancellation
			const controller = new AbortController();
			let cancelRequested = false;

			const onSignal = () => {
				if (cancelRequested) {
					process.exit(130);
				}
				cancelRequested = true;
				controller.abort();
				if (spinner) spinner.text = "Cancelling... (press Ctrl+C again to force quit)";
			};

			process.on("SIGINT", onSignal);
			process.on("SIGTERM", onSignal);

			// Execute
			try {
				await engine.execute(run, testCases, controller.signal);
			} finally {
				process.removeListener("SIGINT", onSignal);
				process.removeListener("SIGTERM", onSignal);
			}

			if (cancelRequested) {
				if (spinner) spinner.warn("Evaluation cancelled");
			} else {
				if (spinner) spinner.succeed("Evaluation complete!");
			}

			// Collect results and scores (single batch query)
			const results = await evalResultRepo.findByRunId(run.id);
			const scoresByResult = await scoreRepo.findByRunId(run.id);
			const allScores = new Map(Object.entries(scoresByResult));

			const finalRun = await evalRunRepo.findById(run.id);

			// Evaluate CI gate
			let gateResult: GateResult | null = null;
			if (gateConfig && finalRun) {
				const gate = new ThresholdGate(gateConfig);
				gateResult = gate.evaluateRun(finalRun, allScores);
			}

			const cacheHitCount = engine.getCacheHits();

			const scorerAvgs = computeScorerAverages(scoresByResult);

			if (isJson) {
				const output = {
					runId: run.id,
					status: finalRun?.status,
					totalCases: finalRun?.totalCases,
					completedCases: finalRun?.completedCases,
					failedCases: finalRun?.failedCases,
					totalCost: finalRun?.totalCost ?? null,
					avgLatencyMs: finalRun?.avgLatencyMs ?? null,
					scores: scorerAvgs,
					cacheHits: cacheHitCount,
					...(gateResult ? { gate: gateResult } : {}),
				};
				console.log(JSON.stringify(output, null, 2));
			} else {
				renderResultsTable(results, allScores);

				console.log();
				console.log(chalk.bold("Summary:"));
				const statusColor =
					finalRun?.status === "cancelled"
						? chalk.yellow
						: finalRun?.status === "failed"
							? chalk.red
							: chalk.green;
				console.log(`  Status: ${statusColor(finalRun?.status)}`);
				console.log(`  Total cases: ${finalRun?.totalCases}`);
				console.log(`  Completed: ${finalRun?.completedCases}`);
				console.log(`  Failed: ${finalRun?.failedCases}`);
				if (finalRun?.totalCost) {
					console.log(`  Total cost: $${finalRun.totalCost.toFixed(4)}`);
				}
				if (finalRun?.avgLatencyMs) {
					console.log(`  Avg latency: ${finalRun.avgLatencyMs.toFixed(0)}ms`);
				}
				if (cacheHitCount > 0) {
					console.log(`  Cache: ${cacheHitCount} of ${finalRun?.totalCases ?? 0} from cache`);
				}

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

			if (options.output) {
				const outputPath = resolve(process.cwd(), options.output);
				exportRun(outputPath, {
					results,
					scores: allScores,
					run: finalRun ?? ({} as EvalRun),
					scorerAverages: scorerAvgs,
				});
				if (!isJson) {
					console.log(chalk.green(`\nResults exported to ${outputPath}`));
				}
			}

			if (gateResult && !gateResult.passed) {
				process.exit(1);
			}
		} catch (error) {
			if (spinner) spinner.fail("Evaluation failed");
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
