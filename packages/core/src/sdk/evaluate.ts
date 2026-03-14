import {
	CostRecordRepository,
	createDB,
	createInMemoryDB,
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
	ChatMessage,
	EvalEvent,
	EvalResult,
	EvalRun,
	IProvider,
	ProviderConfig,
	ScoreResult,
	ScorerConfig,
} from "@llmbench/types";
import { CostCalculator } from "../cost/cost-calculator.js";
import { EvaluationEngine } from "../engine/evaluation-engine.js";
import type { CustomGenerateFn } from "../providers/custom-provider.js";
import { createProvider } from "../providers/index.js";
import { createScorer } from "../scorers/index.js";

export type { CustomGenerateFn } from "../providers/custom-provider.js";

// ── Types ────────────────────────────────────────────────────────────

/** Simplified test case — no id, datasetId, orderIndex */
export interface ISimpleTestCase {
	input: string;
	expected: string;
	messages?: ChatMessage[];
	context?: Record<string, unknown>;
	tags?: string[];
}

/** Full options for evaluate() */
export interface IEvaluateOptions {
	testCases: ISimpleTestCase[];
	providers: ProviderConfig[];
	/** Defaults to [exact-match] if undefined; [] = no scoring */
	scorers?: ScorerConfig[];
	onEvent?: (event: EvalEvent) => void;
	concurrency?: number;
	maxRetries?: number;
	timeoutMs?: number;
	/** Omit = in-memory (no file written) */
	dbPath?: string;
	projectName?: string;
	datasetName?: string;
	/** For type:"custom" providers */
	customProviders?: Map<string, CustomGenerateFn>;
}

/** Quick eval options — single prompt */
export interface IEvaluateQuickOptions {
	prompt: string;
	expected?: string;
	providers: ProviderConfig[];
	scorers?: ScorerConfig[];
	onEvent?: (event: EvalEvent) => void;
	concurrency?: number;
	maxRetries?: number;
	timeoutMs?: number;
	dbPath?: string;
	projectName?: string;
	datasetName?: string;
	customProviders?: Map<string, CustomGenerateFn>;
}

/** Result with scores paired together */
export interface IResultWithScores {
	result: EvalResult;
	scores: ScoreResult[];
}

/** Summary stats */
export interface IEvaluateSummary {
	totalCases: number;
	completedCases: number;
	failedCases: number;
	totalCost: number;
	totalTokens: number;
	avgLatencyMs: number;
	durationMs: number;
}

/** Return value from evaluate() */
export interface IEvaluateResult {
	status: "completed" | "failed";
	run: EvalRun;
	results: IResultWithScores[];
	scoresByResultId: Map<string, ScoreResult[]>;
	summary: IEvaluateSummary;
	scorerAverages: Record<string, number>;
}

// ── Helpers ──────────────────────────────────────────────────────────

function computeScorerAverages(allScores: Map<string, ScoreResult[]>): Record<string, number> {
	const totals = new Map<string, { sum: number; count: number }>();
	for (const scoreList of allScores.values()) {
		for (const score of scoreList) {
			const existing = totals.get(score.scorerName) ?? { sum: 0, count: 0 };
			existing.sum += score.value;
			existing.count++;
			totals.set(score.scorerName, existing);
		}
	}
	const result: Record<string, number> = {};
	for (const [name, { sum, count }] of totals) {
		result[name] = count > 0 ? sum / count : 0;
	}
	return result;
}

const DEFAULT_SCORER_CONFIGS: ScorerConfig[] = [
	{ id: "exact-match", name: "Exact Match", type: "exact-match" },
];

// ── evaluate() ───────────────────────────────────────────────────────

export async function evaluate(options: IEvaluateOptions): Promise<IEvaluateResult> {
	const startTime = performance.now();

	// 1. Validate inputs
	if (!options.testCases || options.testCases.length === 0) {
		throw new Error("testCases must not be empty");
	}
	if (!options.providers || options.providers.length === 0) {
		throw new Error("providers must not be empty");
	}

	for (const pc of options.providers) {
		if (pc.type === "custom") {
			if (!options.customProviders?.has(pc.name)) {
				throw new Error(
					`Custom provider "${pc.name}" requires a matching entry in customProviders map`,
				);
			}
		}
	}

	// 2. Create DB
	const db = options.dbPath ? createDB(options.dbPath) : createInMemoryDB();
	initializeDB(db);

	// 3. Instantiate repositories
	const projectRepo = new ProjectRepository(db);
	const datasetRepo = new DatasetRepository(db);
	const testCaseRepo = new TestCaseRepository(db);
	const providerRepo = new ProviderRepository(db);
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const costRecordRepo = new CostRecordRepository(db);

	// 4. Create project
	const project = await projectRepo.create({
		name: options.projectName ?? "sdk-eval",
	});

	// 5. Create dataset + test cases
	const dataset = await datasetRepo.create({
		projectId: project.id,
		name: options.datasetName ?? "sdk-dataset",
	});

	const testCases = await testCaseRepo.createMany(
		options.testCases.map((tc, i) => ({
			datasetId: dataset.id,
			input: tc.input,
			expected: tc.expected,
			messages: tc.messages,
			context: tc.context,
			tags: tc.tags,
			orderIndex: i,
		})),
	);

	// 6. Create provider records + provider instances
	const providerMap = new Map<string, IProvider>();
	const providerIds: string[] = [];

	for (const pc of options.providers) {
		const provRecord = await providerRepo.create({
			projectId: project.id,
			type: pc.type,
			name: pc.name,
			model: pc.model,
			config: {},
		});

		const customFn = pc.type === "custom" ? options.customProviders?.get(pc.name) : undefined;
		const provider = createProvider(pc, customFn);
		providerMap.set(provRecord.id, provider);
		providerIds.push(provRecord.id);
	}

	// 7. Create scorers
	const scorerConfigs = options.scorers === undefined ? DEFAULT_SCORER_CONFIGS : options.scorers;
	const scorers = scorerConfigs.map((sc) => createScorer(sc));

	// 8. Create EvalRun
	const concurrency = options.concurrency ?? 5;
	const maxRetries = options.maxRetries ?? 3;
	const timeoutMs = options.timeoutMs ?? 30000;
	const totalCases = testCases.length * providerIds.length;

	const run = await evalRunRepo.create({
		projectId: project.id,
		datasetId: dataset.id,
		config: {
			providerIds,
			scorerConfigs,
			concurrency,
			maxRetries,
			timeoutMs,
		},
		totalCases,
	});

	// 9. Construct engine
	const engine = new EvaluationEngine({
		providers: providerMap,
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
	});

	// 10. Wire onEvent
	if (options.onEvent) {
		engine.onEvent(options.onEvent);
	}

	// 11. Execute
	await engine.execute(run, testCases);

	// 12. Query results
	const finalRun = await evalRunRepo.findById(run.id);
	if (!finalRun) {
		throw new Error("Run not found after execution");
	}

	const evalResults = await evalResultRepo.findByRunId(run.id);

	const scoresByResultId = new Map<string, ScoreResult[]>();
	const resultsWithScores: IResultWithScores[] = [];

	for (const result of evalResults) {
		const scores = await scoreRepo.findByResultId(result.id);
		scoresByResultId.set(result.id, scores);
		resultsWithScores.push({ result, scores });
	}

	// 13. Compute summary + scorer averages
	const durationMs = Math.round(performance.now() - startTime);
	const scorerAverages = computeScorerAverages(scoresByResultId);

	const status: "completed" | "failed" =
		finalRun.status === "completed" || finalRun.status === "failed" ? finalRun.status : "failed";

	const summary: IEvaluateSummary = {
		totalCases: finalRun.totalCases,
		completedCases: finalRun.completedCases,
		failedCases: finalRun.failedCases,
		totalCost: finalRun.totalCost ?? 0,
		totalTokens: finalRun.totalTokens ?? 0,
		avgLatencyMs: finalRun.avgLatencyMs ?? 0,
		durationMs,
	};

	return {
		status,
		run: finalRun,
		results: resultsWithScores,
		scoresByResultId,
		summary,
		scorerAverages,
	};
}

// ── evaluateQuick() ──────────────────────────────────────────────────

export async function evaluateQuick(options: IEvaluateQuickOptions): Promise<IEvaluateResult> {
	const hasExpected = options.expected !== undefined;

	const testCases: ISimpleTestCase[] = [
		{ input: options.prompt, expected: options.expected ?? "" },
	];

	// If no expected provided and no explicit scorers, skip scoring
	const scorers =
		options.scorers !== undefined
			? options.scorers
			: hasExpected
				? undefined // use default (exact-match)
				: []; // no scoring

	return evaluate({
		testCases,
		providers: options.providers,
		scorers,
		onEvent: options.onEvent,
		concurrency: options.concurrency,
		maxRetries: options.maxRetries,
		timeoutMs: options.timeoutMs,
		dbPath: options.dbPath,
		projectName: options.projectName,
		datasetName: options.datasetName,
		customProviders: options.customProviders,
	});
}
