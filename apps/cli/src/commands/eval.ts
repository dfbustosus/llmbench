import { resolve } from "node:path";
import type { CreateScorerOptions } from "@llmbench/core";
import {
	CostCalculator,
	createProvider,
	createScorer,
	DEFAULT_CONFIG,
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
import type {
	IProvider,
	IScorer,
	ProviderConfig,
	ProviderType,
	ScorerConfig,
	ScorerType,
} from "@llmbench/types";
import chalk from "chalk";
import { Command } from "commander";
import ora from "ora";
import type { EvalExportData } from "../exporters/index.js";
import { exportEval } from "../exporters/index.js";

const VALID_PROVIDER_TYPES = new Set<string>([
	"openai",
	"azure-openai",
	"anthropic",
	"google",
	"mistral",
	"together",
	"bedrock",
	"ollama",
	"custom",
]);

const VALID_SCORER_TYPES = new Set<string>([
	"exact-match",
	"contains",
	"regex",
	"json-match",
	"json-schema",
	"cosine-similarity",
	"levenshtein",
	"bleu",
	"rouge",
	"embedding-similarity",
	"llm-judge",
	"composite",
	"custom",
	"context-precision",
	"context-recall",
	"faithfulness",
	"answer-relevancy",
]);

export function parseProviderShorthand(shorthand: string): ProviderConfig {
	const colonIdx = shorthand.indexOf(":");
	if (colonIdx === -1) {
		throw new Error(
			`Invalid provider format: "${shorthand}". Expected "type:model" (e.g., "openai:gpt-4o")`,
		);
	}

	const type = shorthand.slice(0, colonIdx);
	const model = shorthand.slice(colonIdx + 1);

	if (!type || !model) {
		throw new Error(
			`Invalid provider format: "${shorthand}". Both type and model are required (e.g., "openai:gpt-4o")`,
		);
	}

	if (!VALID_PROVIDER_TYPES.has(type)) {
		throw new Error(
			`Unknown provider type: "${type}". Valid types: ${[...VALID_PROVIDER_TYPES].join(", ")}`,
		);
	}

	return {
		type: type as ProviderType,
		name: `${type}/${model}`,
		model,
	};
}

export function parseScorerShorthand(type: string): ScorerConfig {
	if (!VALID_SCORER_TYPES.has(type)) {
		throw new Error(
			`Unknown scorer type: "${type}". Valid types: ${[...VALID_SCORER_TYPES].join(", ")}`,
		);
	}

	const name = type
		.split("-")
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	return {
		id: type,
		name,
		type: type as ScorerType,
	};
}

async function readStdin(): Promise<string | null> {
	if (process.stdin.isTTY) {
		return null;
	}

	return new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf-8");
		process.stdin.on("data", (chunk: string) => {
			data += chunk;
		});
		process.stdin.on("end", () => resolve(data.trim()));
		process.stdin.on("error", reject);
	});
}

function resolvePrompt(positional: string | undefined, stdin: string | null): string {
	if (stdin && positional) {
		return `${stdin}\n\n${positional}`;
	}
	if (positional) {
		return positional;
	}
	if (stdin) {
		return stdin;
	}
	throw new Error(
		'No prompt provided. Pass a prompt as an argument or pipe via stdin.\n\nUsage:\n  llmbench eval "Your prompt here" -p openai:gpt-4o\n  echo "Your prompt" | llmbench eval -p openai:gpt-4o',
	);
}

function collect(value: string, previous: string[]): string[] {
	return previous.concat([value]);
}

export const evalCommand = new Command("eval")
	.description("Quick inline evaluation — test a prompt against one or more providers")
	.argument("[prompt]", "The prompt text (or pipe via stdin)")
	.requiredOption("-p, --provider <type:model>", "Provider (repeatable)", collect, [])
	.option("-e, --expected <text>", "Expected output for scoring")
	.option("-s, --scorer <type>", "Scorer type (repeatable)", collect, [])
	.option("--system <text>", "System message")
	.option("-t, --temperature <n>", "Temperature (0-2)", Number.parseFloat)
	.option("--max-tokens <n>", "Max output tokens", Number.parseInt)
	.option("--json", "Output results as JSON")
	.option("--json-mode", "Request JSON output from providers (response_format: json_object)")
	.option("--no-save", "Don't persist results to database")
	.option("-c, --config <path>", "Config file path")
	.option("-o, --output <file>", "Export results to file (.json, .csv, .html)")
	.action(async (promptArg: string | undefined, options) => {
		const isJson = !!options.json;
		const spinner = isJson ? null : ora().start();

		try {
			// 1. Resolve prompt
			if (spinner) spinner.text = "Reading input...";
			const stdin = await readStdin();
			const prompt = resolvePrompt(promptArg, stdin);

			// 2. Parse provider shorthands
			const providerShorthands: string[] = options.provider;
			if (providerShorthands.length === 0) {
				throw new Error(
					'At least one provider is required.\n\nUsage:\n  llmbench eval "prompt" -p openai:gpt-4o',
				);
			}
			const providerConfigs = providerShorthands.map((s) => {
				const pc = parseProviderShorthand(s);
				if (options.system) pc.systemMessage = options.system;
				if (options.temperature !== undefined) pc.temperature = options.temperature;
				if (options.maxTokens !== undefined) pc.maxTokens = options.maxTokens;
				if (options.jsonMode) pc.responseFormat = { type: "json_object" };
				return pc;
			});

			// 3. Parse scorer shorthands
			let scorerConfigs: ScorerConfig[] = [];
			const scorerShorthands: string[] = options.scorer;
			if (scorerShorthands.length > 0) {
				scorerConfigs = scorerShorthands.map(parseScorerShorthand);
			} else if (options.expected) {
				scorerConfigs = [parseScorerShorthand("exact-match")];
			}

			// 4. Choose save vs no-save path
			let evalExportData: EvalExportData;
			if (!options.save) {
				// --no-save fast path: skip all DB operations
				evalExportData = await runNoSave(
					prompt,
					providerConfigs,
					scorerConfigs,
					options.expected,
					isJson,
					spinner,
				);
			} else {
				// Default: save to DB
				evalExportData = await runWithSave(
					prompt,
					providerConfigs,
					scorerConfigs,
					options.expected,
					isJson,
					spinner,
					options.config,
				);
			}

			if (options.output) {
				const outputPath = resolve(process.cwd(), options.output);
				exportEval(outputPath, evalExportData);
				if (!isJson) {
					console.log(chalk.green(`Results exported to ${outputPath}`));
				}
			}
		} catch (error) {
			if (spinner) spinner.fail("Eval failed");
			const msg = error instanceof Error ? error.message : String(error);
			if (isJson) {
				console.log(JSON.stringify({ error: msg }, null, 2));
			} else {
				console.error(chalk.red(msg));
			}
			process.exit(1);
		}
	});

export interface EvalResultData {
	provider: string;
	model: string;
	output: string;
	latencyMs: number;
	tokens: { input: number; output: number; total: number };
	cost: number | null;
	scores: Array<{ scorer: string; value: number }>;
	error?: string;
}

async function runNoSave(
	prompt: string,
	providerConfigs: ProviderConfig[],
	scorerConfigs: ScorerConfig[],
	expected: string | undefined,
	isJson: boolean,
	spinner: ReturnType<typeof ora> | null,
): Promise<EvalExportData> {
	const costCalculator = new CostCalculator();
	const providersByName = new Map(providerConfigs.map((pc) => [pc.name, createProvider(pc)]));
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
	const results: EvalResultData[] = [];

	for (const pc of providerConfigs) {
		if (spinner) spinner.text = `Calling ${pc.name}...`;
		const provider = providersByName.get(pc.name) ?? createProvider(pc);

		try {
			const response = await provider.generate(prompt, pc);
			const costEstimate = costCalculator.calculate(pc.model, pc.type, response.tokenUsage);

			const scores: Array<{ scorer: string; value: number }> = [];
			if (expected && scorers.length > 0) {
				for (const scorer of scorers) {
					const scoreResult = await scorer.score(response.output, expected, prompt);
					scores.push({ scorer: scorer.type, value: scoreResult.value });
				}
			}

			results.push({
				provider: pc.name,
				model: pc.model,
				output: response.output,
				latencyMs: response.latencyMs,
				tokens: {
					input: response.tokenUsage.inputTokens,
					output: response.tokenUsage.outputTokens,
					total: response.tokenUsage.totalTokens,
				},
				cost: costEstimate.totalCost || null,
				scores,
			});
		} catch (err) {
			results.push({
				provider: pc.name,
				model: pc.model,
				output: "",
				latencyMs: 0,
				tokens: { input: 0, output: 0, total: 0 },
				cost: null,
				scores: [],
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	if (spinner) spinner.stop();
	outputResults(prompt, expected, results, isJson);
	return { prompt, expected, results };
}

async function runWithSave(
	prompt: string,
	providerConfigs: ProviderConfig[],
	scorerConfigs: ScorerConfig[],
	expected: string | undefined,
	isJson: boolean,
	spinner: ReturnType<typeof ora> | null,
	configPath: string | undefined,
): Promise<EvalExportData> {
	// Load config for dbPath
	if (spinner) spinner.text = "Loading configuration...";
	let dbPath = DEFAULT_CONFIG.dbPath ?? "./llmbench.db";
	try {
		const config = mergeWithDefaults(await loadConfig(configPath));
		if (config.dbPath) dbPath = config.dbPath;
	} catch {
		// No config file found — use defaults
	}

	if (spinner) spinner.text = "Initializing database...";
	const db = createDB(dbPath);
	initializeDB(db);

	const projectRepo = new ProjectRepository(db);
	const datasetRepo = new DatasetRepository(db);
	const testCaseRepo = new TestCaseRepository(db);
	const providerRepo = new ProviderRepository(db);
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const costRecordRepo = new CostRecordRepository(db);

	// Find-or-create project "quick-eval"
	const projects = await projectRepo.findAll();
	let project = projects.find((p) => p.name === "quick-eval");
	if (!project) {
		project = await projectRepo.create({
			name: "quick-eval",
			description: "Quick inline evaluations",
		});
	}

	// Create inline dataset with auto-versioning to avoid unique constraint conflicts
	if (spinner) spinner.text = "Setting up evaluation...";
	const existingVersions = await datasetRepo.findByNameInProject(project.id, "ad-hoc");
	const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;
	const dataset = await datasetRepo.create({
		projectId: project.id,
		name: "ad-hoc",
		description: "Inline eval prompt",
		version: nextVersion,
	});

	await testCaseRepo.createMany([
		{
			datasetId: dataset.id,
			input: prompt,
			expected: expected ?? "",
			orderIndex: 0,
		},
	]);

	const testCases = await testCaseRepo.findByDatasetId(dataset.id);

	// Create providers (DB records + live instances)
	const providerMap = new Map<string, IProvider>();
	const providersByName = new Map<string, IProvider>();
	const providerIds: string[] = [];
	const providerIdToConfig = new Map<string, ProviderConfig>();

	for (const pc of providerConfigs) {
		const provider = createProvider(pc);
		providersByName.set(pc.name, provider);

		let providerRecord = await providerRepo.findByProjectAndName(project.id, pc.name);
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
		providerMap.set(providerRecord.id, provider);
		providerIdToConfig.set(providerRecord.id, pc);
	}

	// Create scorers
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

	// Create eval run
	if (spinner) spinner.text = "Running evaluation...";
	const run = await evalRunRepo.create({
		projectId: project.id,
		datasetId: dataset.id,
		config: {
			providerIds,
			scorerConfigs,
			concurrency: 1,
			maxRetries: 3,
			timeoutMs: 30000,
		},
		totalCases: testCases.length * providerIds.length,
		datasetVersion: dataset.version,
	});

	// Execute
	const engine = new EvaluationEngine({
		providers: providerMap,
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
	});

	await engine.execute(run, testCases);

	// Collect results (single batch query — no N+1)
	const evalResults = await evalResultRepo.findByRunId(run.id);
	const allScoresByResult = await scoreRepo.findByRunId(run.id);
	const results: EvalResultData[] = [];

	for (const result of evalResults) {
		const resultScores = allScoresByResult[result.id] ?? [];
		const pc = providerIdToConfig.get(result.providerId);
		if (!pc) {
			throw new Error(`Unknown provider ID in result: ${result.providerId}`);
		}

		results.push({
			provider: pc.name,
			model: pc.model,
			output: result.output,
			latencyMs: result.latencyMs,
			tokens: {
				input: result.tokenUsage?.inputTokens ?? 0,
				output: result.tokenUsage?.outputTokens ?? 0,
				total: result.tokenUsage?.totalTokens ?? 0,
			},
			cost: result.cost ?? null,
			scores: resultScores.map((s) => ({ scorer: s.scorerType, value: s.value })),
			error: result.error ?? undefined,
		});
	}

	if (spinner) spinner.succeed("Evaluation complete!");
	outputResults(prompt, expected, results, isJson);
	return { prompt, expected, results };
}

function outputResults(
	prompt: string,
	expected: string | undefined,
	results: EvalResultData[],
	isJson: boolean,
): void {
	if (isJson) {
		const output: Record<string, unknown> = {
			prompt,
			...(expected !== undefined ? { expected } : {}),
			results: results.map((r) => ({
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
		console.log(JSON.stringify(output, null, 2));
		return;
	}

	// Human-readable output
	console.log();
	for (const result of results) {
		if (result.error) {
			console.log(chalk.bold(`Provider: ${result.provider}`));
			console.log(chalk.red(`Error:    ${result.error}`));
			console.log();
			continue;
		}

		console.log(chalk.bold(`Provider: ${result.provider}`));
		console.log(`Output:   ${result.output}`);
		console.log(`Latency:  ${result.latencyMs.toFixed(0)}ms`);
		console.log(`Tokens:   ${result.tokens.input} in / ${result.tokens.output} out`);
		if (result.cost) {
			console.log(`Cost:     $${result.cost.toFixed(6)}`);
		}

		if (result.scores.length > 0) {
			console.log();
			console.log(chalk.dim("Scores:"));
			for (const score of result.scores) {
				const label = score.scorer
					.split("-")
					.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
					.join(" ");
				const icon = score.value >= 0.8 ? chalk.green("\u2713") : chalk.red("\u2717");
				const color = score.value >= 0.8 ? chalk.green : chalk.red;
				console.log(`  ${label.padEnd(20)} ${color(score.value.toFixed(2))} ${icon}`);
			}
		}

		console.log();
	}
}
