import type { LLMBenchDB } from "@llmbench/db";
import {
	createDB,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	ScoreRepository,
	TestCaseRepository,
} from "@llmbench/db";
import type { EvalEvent, EvalRun, ScoreResult, ScorerConfig, TestCase } from "@llmbench/types";
import { RescoringEngine } from "../engine/rescoring-engine.js";
import { computeScorerAverages } from "../scorers/averages.js";
import type { CreateScorerOptions } from "../scorers/index.js";
import { createScorer } from "../scorers/index.js";
import type { ResultWithScores } from "./evaluate.js";

// ── Types ────────────────────────────────────────────────────────────

export interface RescoreOptions {
	/** The run ID to rescore. */
	runId: string;
	/** New scorer configs. If omitted, reuses the run's original scorer configs. */
	scorers?: ScorerConfig[];
	/** Options for scorers that need external dependencies (llm-judge, embedding-similarity). */
	scorerOptions?: CreateScorerOptions;
	onEvent?: (event: EvalEvent) => void;
	/** Pre-existing DB handle. */
	db?: LLMBenchDB;
	/** Path to a DB file. Ignored when `db` is provided. */
	dbPath?: string;
}

export interface RescoreResult {
	run: EvalRun;
	results: ResultWithScores[];
	scoresByResultId: Record<string, ScoreResult[]>;
	scorerAverages: Record<string, number>;
}

// ── rescore() ────────────────────────────────────────────────────────

export async function rescore(options: RescoreOptions): Promise<RescoreResult> {
	// 1. Resolve DB
	if (!options.db && !options.dbPath) {
		throw new Error("Either db or dbPath must be provided for rescoring");
	}
	const db =
		options.db ??
		(() => {
			const d = createDB(options.dbPath as string);
			initializeDB(d);
			return d;
		})();

	// 2. Repositories
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const testCaseRepo = new TestCaseRepository(db);

	// 3. Load run
	const run = await evalRunRepo.findById(options.runId);
	if (!run) {
		throw new Error(`Run "${options.runId}" not found`);
	}

	// 4. Resolve scorer configs (provided or from run's stored config)
	const scorerConfigs = options.scorers ?? run.config.scorerConfigs;
	if (scorerConfigs.length === 0) {
		throw new Error("No scorer configs provided and none found in the run's config");
	}

	// 5. Create scorer instances
	const scorers = scorerConfigs.map((sc) => createScorer(sc, options.scorerOptions));

	// 6. Load test cases for assertion support
	const testCaseMap = await buildTestCaseMap(testCaseRepo, evalResultRepo, run.id);

	// 7. Construct and run engine
	const engine = new RescoringEngine({
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
	});

	if (options.onEvent) {
		engine.onEvent(options.onEvent);
	}

	const engineResult = await engine.execute(
		run.id,
		testCaseMap,
		options.scorers ? scorerConfigs : undefined,
	);

	// 8. Assemble response
	const finalRun = await evalRunRepo.findById(run.id);
	if (!finalRun) {
		throw new Error("Run not found after rescoring");
	}

	const allResults = await evalResultRepo.findByRunId(run.id);
	const resultsWithScores: ResultWithScores[] = allResults.map((result) => ({
		result,
		scores: engineResult.scoresByResultId[result.id] ?? [],
	}));

	const scorerAverages = computeScorerAverages(engineResult.scoresByResultId);

	return {
		run: finalRun,
		results: resultsWithScores,
		scoresByResultId: engineResult.scoresByResultId,
		scorerAverages,
	};
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Builds a testCaseId -> TestCase map from the run's results.
 * Only loads the test cases actually referenced by results in this run.
 */
async function buildTestCaseMap(
	testCaseRepo: TestCaseRepository,
	evalResultRepo: EvalResultRepository,
	runId: string,
): Promise<Map<string, TestCase>> {
	const results = await evalResultRepo.findByRunId(runId);
	const uniqueIds = [...new Set(results.map((r) => r.testCaseId))];

	const map = new Map<string, TestCase>();
	for (const id of uniqueIds) {
		const tc = await testCaseRepo.findById(id);
		if (tc) {
			map.set(id, tc);
		}
	}
	return map;
}
