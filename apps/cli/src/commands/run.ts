import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	CostCalculator,
	createProvider,
	createScorer,
	EvaluationEngine,
	loadConfig,
	mergeWithDefaults,
} from "@llmbench/core";
import {
	CostRecordRepository,
	createDB,
	DatasetRepository,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	ProjectRepository,
	ProviderRepository,
	ScoreRepository,
	TestCaseRepository,
} from "@llmbench/db";
import type { IScorer } from "@llmbench/types";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import { renderResultsTable } from "../renderers/results-table.js";

function validateDatasetJson(data: unknown): asserts data is {
	name?: string;
	description?: string;
	testCases: Array<{
		input: string;
		expected: string;
		messages?: Array<{ role: string; content: string }>;
		context?: Record<string, unknown>;
		tags?: string[];
	}>;
} {
	if (!data || typeof data !== "object") {
		throw new Error("Dataset file must contain a JSON object");
	}
	const obj = data as Record<string, unknown>;
	if (!Array.isArray(obj.testCases)) {
		throw new Error('Dataset file must have a "testCases" array');
	}
	for (let i = 0; i < obj.testCases.length; i++) {
		const tc = obj.testCases[i] as Record<string, unknown>;
		if (typeof tc.input !== "string") {
			throw new Error(`testCases[${i}] must have a string "input" field`);
		}
		if (typeof tc.expected !== "string") {
			throw new Error(`testCases[${i}] must have a string "expected" field`);
		}
	}
}

export const runCommand = new Command("run")
	.description("Run an evaluation")
	.requiredOption("-d, --dataset <path>", "Path to dataset JSON file")
	.option("-c, --config <path>", "Path to config file")
	.option("--concurrency <number>", "Concurrency level", "5")
	.option("--tags <tags>", "Comma-separated tags")
	.action(async (options) => {
		const spinner = ora("Loading configuration...").start();

		try {
			const config = mergeWithDefaults(await loadConfig(options.config));
			spinner.text = "Initializing database...";

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
			spinner.text = "Loading dataset...";
			const datasetPath = resolve(process.cwd(), options.dataset);

			if (!existsSync(datasetPath)) {
				throw new Error(`Dataset file not found: ${datasetPath}`);
			}

			let datasetJson: unknown;
			try {
				datasetJson = JSON.parse(readFileSync(datasetPath, "utf-8"));
			} catch (e) {
				throw new Error(
					`Failed to parse dataset JSON: ${e instanceof Error ? e.message : String(e)}`,
				);
			}

			validateDatasetJson(datasetJson);

			if (datasetJson.testCases.length === 0) {
				throw new Error("Dataset must contain at least one test case");
			}

			let dataset = (await datasetRepo.findByProjectId(project.id)).find(
				(d) => d.name === (datasetJson.name || "Untitled Dataset"),
			);
			if (!dataset) {
				dataset = await datasetRepo.create({
					projectId: project.id,
					name: datasetJson.name || "Untitled Dataset",
					description: datasetJson.description,
				});
			}

			// Create test cases
			const existingCases = await testCaseRepo.findByDatasetId(dataset.id);
			if (existingCases.length === 0) {
				await testCaseRepo.createMany(
					datasetJson.testCases.map((tc, i) => ({
						datasetId: dataset.id,
						input: tc.input,
						expected: tc.expected,
						messages: tc.messages as
							| Array<{ role: "system" | "user" | "assistant"; content: string }>
							| undefined,
						context: tc.context,
						tags: tc.tags,
						orderIndex: i,
					})),
				);
			}

			const testCases = await testCaseRepo.findByDatasetId(dataset.id);

			// Create/find providers
			spinner.text = "Setting up providers...";

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
			spinner.text = "Starting evaluation...";
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
			});

			// Listen to events for progress
			let lastProgress = 0;
			engine.onEvent((event) => {
				if (event.type === "run:progress") {
					const pct = Math.round((event.completedCases / event.totalCases) * 100);
					if (pct > lastProgress) {
						lastProgress = pct;
						spinner.text = `Running evaluation... ${pct}% (${event.completedCases}/${event.totalCases})`;
					}
				}
			});

			// Execute
			await engine.execute(run, testCases);
			spinner.succeed("Evaluation complete!");

			// Display results
			const results = await evalResultRepo.findByRunId(run.id);
			const allScores = new Map<string, Awaited<ReturnType<typeof scoreRepo.findByResultId>>>();
			for (const result of results) {
				allScores.set(result.id, await scoreRepo.findByResultId(result.id));
			}

			renderResultsTable(results, allScores);

			const finalRun = await evalRunRepo.findById(run.id);
			console.log();
			console.log(chalk.bold("Summary:"));
			console.log(`  Status: ${chalk.green(finalRun?.status)}`);
			console.log(`  Total cases: ${finalRun?.totalCases}`);
			console.log(`  Completed: ${finalRun?.completedCases}`);
			console.log(`  Failed: ${finalRun?.failedCases}`);
			if (finalRun?.totalCost) {
				console.log(`  Total cost: $${finalRun.totalCost.toFixed(4)}`);
			}
			if (finalRun?.avgLatencyMs) {
				console.log(`  Avg latency: ${finalRun.avgLatencyMs.toFixed(0)}ms`);
			}
		} catch (error) {
			spinner.fail("Evaluation failed");
			console.error(chalk.red(error instanceof Error ? error.message : String(error)));
			process.exit(1);
		}
	});
