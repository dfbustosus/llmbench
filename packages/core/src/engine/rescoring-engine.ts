import type { EvalResultRepository, EvalRunRepository, ScoreRepository } from "@llmbench/db";
import type {
	EvalEvent,
	EvalResult,
	IScorer,
	ScoreResult,
	ScorerConfig,
	TestCase,
} from "@llmbench/types";
import { computeScorerAverages } from "../scorers/averages.js";
import { EventBus } from "./event-bus.js";
import { createScorerFromAssertion } from "./scorer-utils.js";

export interface RescoreEngineOptions {
	scorers: IScorer[];
	evalRunRepo: EvalRunRepository;
	evalResultRepo: EvalResultRepository;
	scoreRepo: ScoreRepository;
}

export interface RescoreEngineResult {
	totalResults: number;
	scoredResults: number;
	failedResults: number;
	scoresByResultId: Record<string, ScoreResult[]>;
}

/**
 * Applies scorers to existing evaluation results without re-calling providers.
 *
 * Workflow: load stored outputs -> delete old scores -> run new scorers -> persist.
 * Honors per-test-case assertions when a testCase map is provided.
 */
export class RescoringEngine {
	private eventBus = new EventBus();
	private scorers: IScorer[];
	private evalRunRepo: EvalRunRepository;
	private evalResultRepo: EvalResultRepository;
	private scoreRepo: ScoreRepository;

	constructor(options: RescoreEngineOptions) {
		this.scorers = options.scorers;
		this.evalRunRepo = options.evalRunRepo;
		this.evalResultRepo = options.evalResultRepo;
		this.scoreRepo = options.scoreRepo;
	}

	onEvent(handler: (event: EvalEvent) => void): () => void {
		return this.eventBus.on(handler);
	}

	/**
	 * Re-scores all results for the given run.
	 *
	 * @param runId       The evaluation run to rescore.
	 * @param testCases   Optional map of testCaseId -> TestCase for assertion support.
	 * @param newConfigs  Optional new scorer configs to persist on the run.
	 */
	async execute(
		runId: string,
		testCases?: Map<string, TestCase>,
		newConfigs?: ScorerConfig[],
	): Promise<RescoreEngineResult> {
		// 1. Validate run exists and is completed
		const run = await this.evalRunRepo.findById(runId);
		if (!run) {
			throw new Error(`Run "${runId}" not found`);
		}
		if (run.status !== "completed" && run.status !== "failed") {
			throw new Error(
				`Run "${runId}" has status "${run.status}". Only completed or failed runs can be rescored.`,
			);
		}

		// 2. Load results, filter out failed ones (no output to score)
		const allResults = await this.evalResultRepo.findByRunId(runId);
		if (allResults.length === 0) {
			throw new Error(`No results found for run "${runId}"`);
		}

		const scorableResults = allResults.filter((r) => !r.error);

		this.eventBus.emit({
			type: "rescore:started",
			runId,
			totalResults: scorableResults.length,
			timestamp: new Date().toISOString(),
		});

		// 3. Delete all existing scores for this run (atomic replacement)
		await this.scoreRepo.deleteByRunId(runId);

		// 4. Score each result
		const scoresByResultId: Record<string, ScoreResult[]> = {};
		let scoredResults = 0;
		let failedResults = 0;

		for (const result of scorableResults) {
			try {
				const scores = await this.scoreResult(result, testCases);
				await this.scoreRepo.createMany(result.id, scores);
				scoresByResultId[result.id] = scores;
				scoredResults++;
			} catch {
				failedResults++;
			}

			this.eventBus.emit({
				type: "rescore:progress",
				runId,
				completedResults: scoredResults + failedResults,
				totalResults: scorableResults.length,
				timestamp: new Date().toISOString(),
			});
		}

		// 5. Update run config with new scorer configs (if provided)
		if (newConfigs) {
			await this.evalRunRepo.updateConfig(runId, {
				...run.config,
				scorerConfigs: newConfigs,
			});
		}

		// 6. Compute averages for the completed event
		const scorerAverages = computeScorerAverages(scoresByResultId);

		this.eventBus.emit({
			type: "rescore:completed",
			runId,
			totalResults: scorableResults.length,
			scorerAverages,
			timestamp: new Date().toISOString(),
		});

		return {
			totalResults: scorableResults.length,
			scoredResults,
			failedResults,
			scoresByResultId,
		};
	}

	private async scoreResult(
		result: EvalResult,
		testCases?: Map<string, TestCase>,
	): Promise<ScoreResult[]> {
		const testCase = testCases?.get(result.testCaseId);

		// Per-test-case assertions override global scorers
		let caseScorers: Array<{ scorer: IScorer; expected: string }>;
		if (testCase?.assert && testCase.assert.length > 0) {
			caseScorers = testCase.assert.map((a) => ({
				scorer: createScorerFromAssertion(a),
				expected: a.value,
			}));
		} else {
			caseScorers = this.scorers.map((s) => ({
				scorer: s,
				expected: result.expected,
			}));
		}

		// Merge stored toolCalls into context so agent scorers can access them
		const scorerContext = testCase?.context
			? { ...testCase.context, toolCalls: result.toolCalls }
			: result.toolCalls
				? { toolCalls: result.toolCalls }
				: undefined;

		const scores: ScoreResult[] = [];
		for (const { scorer, expected } of caseScorers) {
			const scoreResult = await scorer.score(result.output, expected, result.input, scorerContext);
			scores.push(scoreResult);
		}

		return scores;
	}
}
