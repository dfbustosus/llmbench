import {
	CostRecordRepository,
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
import type { EvalEvent, TestCase } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import { CostCalculator } from "../cost/cost-calculator.js";
import { EvaluationEngine } from "../engine/evaluation-engine.js";
import { RescoringEngine } from "../engine/rescoring-engine.js";
import { CustomProvider } from "../providers/custom-provider.js";
import { ContainsScorer } from "../scorers/deterministic/contains.js";
import { ExactMatchScorer } from "../scorers/deterministic/exact-match.js";
import { RegexScorer } from "../scorers/deterministic/regex.js";

/** Bootstraps a completed evaluation run and returns all the handles needed for rescoring. */
async function setupCompletedRun() {
	const db = createInMemoryDB();
	initializeDB(db);

	const projectRepo = new ProjectRepository(db);
	const datasetRepo = new DatasetRepository(db);
	const testCaseRepo = new TestCaseRepository(db);
	const providerRepo = new ProviderRepository(db);
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const costRecordRepo = new CostRecordRepository(db);

	const project = await projectRepo.create({ name: "Rescore Project" });
	const dataset = await datasetRepo.create({
		projectId: project.id,
		name: "Rescore Dataset",
	});

	const tc1 = await testCaseRepo.create({
		datasetId: dataset.id,
		input: "What is the capital of France?",
		expected: "Paris",
		orderIndex: 0,
	});
	const tc2 = await testCaseRepo.create({
		datasetId: dataset.id,
		input: "What is 2+2?",
		expected: "4",
		orderIndex: 1,
	});

	const provRecord = await providerRepo.create({
		projectId: project.id,
		type: "custom",
		name: "MockLLM",
		model: "mock-v1",
		config: {},
	});

	const mockProvider = new CustomProvider(
		{ type: "custom", name: "MockLLM", model: "mock-v1" },
		async (input) => {
			const text = typeof input === "string" ? input : input.map((m) => m.content).join(" ");
			return {
				output: text.includes("capital") ? "Paris" : "4",
				latencyMs: 50,
				tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			};
		},
	);

	// Run initial evaluation with ExactMatch scorer
	const engine = new EvaluationEngine({
		providers: new Map([[provRecord.id, mockProvider]]),
		scorers: [new ExactMatchScorer()],
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
	});

	const run = await evalRunRepo.create({
		projectId: project.id,
		datasetId: dataset.id,
		config: {
			providerIds: [provRecord.id],
			scorerConfigs: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			concurrency: 1,
			maxRetries: 0,
			timeoutMs: 5000,
		},
		totalCases: 2,
	});

	await engine.execute(run, [tc1, tc2]);

	return {
		db,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		testCaseRepo,
		run,
		testCases: [tc1, tc2] as TestCase[],
	};
}

describe("RescoringEngine", () => {
	it("should replace old scores with new scorer results", async () => {
		const { evalRunRepo, evalResultRepo, scoreRepo, run } = await setupCompletedRun();

		// Verify initial state: 1 scorer x 2 results = 2 scores
		const oldScores = await scoreRepo.findByRunId(run.id);
		const oldScoreCount = Object.values(oldScores).flat().length;
		expect(oldScoreCount).toBe(2);

		// All initial scores should be ExactMatch
		for (const scores of Object.values(oldScores)) {
			for (const s of scores) {
				expect(s.scorerType).toBe("exact-match");
			}
		}

		// Rescore with two different scorers
		const engine = new RescoringEngine({
			scorers: [new ExactMatchScorer(), new ContainsScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		const result = await engine.execute(run.id);

		// Verify: 2 scorers x 2 results = 4 new scores
		expect(result.totalResults).toBe(2);
		expect(result.scoredResults).toBe(2);
		expect(result.failedResults).toBe(0);

		const newScores = await scoreRepo.findByRunId(run.id);
		const newScoreCount = Object.values(newScores).flat().length;
		expect(newScoreCount).toBe(4);

		// Verify both scorer types are present
		const allTypes = new Set<string>();
		for (const scores of Object.values(newScores)) {
			for (const s of scores) {
				allTypes.add(s.scorerType);
			}
		}
		expect(allTypes).toContain("exact-match");
		expect(allTypes).toContain("contains");
	});

	it("should emit rescore events in correct order", async () => {
		const { evalRunRepo, evalResultRepo, scoreRepo, run } = await setupCompletedRun();

		const engine = new RescoringEngine({
			scorers: [new ContainsScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		const events: EvalEvent[] = [];
		engine.onEvent((e) => events.push(e));

		await engine.execute(run.id);

		const types = events.map((e) => e.type);
		expect(types[0]).toBe("rescore:started");
		expect(types[types.length - 1]).toBe("rescore:completed");
		expect(types.filter((t) => t === "rescore:progress")).toHaveLength(2);

		// Verify completed event includes scorer averages
		const completed = events.find((e) => e.type === "rescore:completed");
		expect(completed).toBeDefined();
		if (completed?.type === "rescore:completed") {
			expect(completed.totalResults).toBe(2);
			expect(completed.scorerAverages).toBeDefined();
		}
	});

	it("should update run config when new scorer configs are provided", async () => {
		const { evalRunRepo, evalResultRepo, scoreRepo, run } = await setupCompletedRun();

		const newConfigs = [
			{ id: "contains", name: "Contains", type: "contains" as const },
			{ id: "regex", name: "Regex", type: "regex" as const },
		];

		const engine = new RescoringEngine({
			scorers: [new ContainsScorer(), new RegexScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		await engine.execute(run.id, undefined, newConfigs);

		const updatedRun = await evalRunRepo.findById(run.id);
		expect(updatedRun?.config.scorerConfigs).toEqual(newConfigs);
	});

	it("should honor per-test-case assertions over global scorers", async () => {
		const { evalRunRepo, evalResultRepo, scoreRepo, testCaseRepo, run, testCases } =
			await setupCompletedRun();

		// Update tc1 to have an inline assertion
		const tc1 = testCases[0];
		const tc1WithAssert = await testCaseRepo.findById(tc1.id);
		expect(tc1WithAssert).toBeDefined();

		// Build a test case map that includes the assertion
		const testCaseMap = new Map<string, TestCase>();
		testCaseMap.set(tc1.id, { ...tc1, assert: [{ type: "contains", value: "Par" }] });
		testCaseMap.set(testCases[1].id, testCases[1]);

		const engine = new RescoringEngine({
			scorers: [new ExactMatchScorer()], // global scorer
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		const result = await engine.execute(run.id, testCaseMap);

		// tc1 should have assertion score (contains), tc2 should have global (exact-match)
		const results = await evalResultRepo.findByRunId(run.id);
		const tc1Result = results.find((r) => r.testCaseId === tc1.id);
		const tc2Result = results.find((r) => r.testCaseId === testCases[1].id);

		expect(tc1Result).toBeDefined();
		expect(tc2Result).toBeDefined();

		const tc1Scores = result.scoresByResultId[tc1Result?.id ?? ""];
		const tc2Scores = result.scoresByResultId[tc2Result?.id ?? ""];

		// tc1 used assertion → contains scorer
		expect(tc1Scores).toHaveLength(1);
		expect(tc1Scores[0].scorerType).toBe("contains");

		// tc2 used global → exact-match scorer
		expect(tc2Scores).toHaveLength(1);
		expect(tc2Scores[0].scorerType).toBe("exact-match");
	});

	it("should skip failed results (those with errors)", async () => {
		const db = createInMemoryDB();
		initializeDB(db);

		const projectRepo = new ProjectRepository(db);
		const datasetRepo = new DatasetRepository(db);
		const testCaseRepo = new TestCaseRepository(db);
		const providerRepo = new ProviderRepository(db);
		const evalRunRepo = new EvalRunRepository(db);
		const evalResultRepo = new EvalResultRepository(db);
		const scoreRepo = new ScoreRepository(db);
		const costRecordRepo = new CostRecordRepository(db);

		const project = await projectRepo.create({ name: "Error Test" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Error Dataset",
		});

		const tc1 = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "good question",
			expected: "good answer",
			orderIndex: 0,
		});
		const tc2 = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "bad question",
			expected: "bad answer",
			orderIndex: 1,
		});

		const provRecord = await providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "HalfFail",
			model: "half-v1",
			config: {},
		});

		// Provider that fails on the second question
		const mockProvider = new CustomProvider(
			{ type: "custom", name: "HalfFail", model: "half-v1" },
			async (input) => {
				const text = typeof input === "string" ? input : input.map((m) => m.content).join(" ");
				if (text.includes("bad")) {
					return {
						output: "",
						latencyMs: 10,
						tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
						error: "Simulated error",
					};
				}
				return {
					output: "good answer",
					latencyMs: 50,
					tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				};
			},
		);

		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
			costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		const run = await evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provRecord.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 5000,
			},
			totalCases: 2,
		});

		await engine.execute(run, [tc1, tc2]);

		// Rescore — should only score 1 result (the non-error one)
		const rescoreEngine = new RescoringEngine({
			scorers: [new ContainsScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		const result = await rescoreEngine.execute(run.id);

		expect(result.totalResults).toBe(1); // Only 1 scorable result
		expect(result.scoredResults).toBe(1);
		expect(result.failedResults).toBe(0);
	});

	it("should reject rescoring a non-completed run", async () => {
		const db = createInMemoryDB();
		initializeDB(db);

		const projectRepo = new ProjectRepository(db);
		const datasetRepo = new DatasetRepository(db);
		const evalRunRepo = new EvalRunRepository(db);
		const evalResultRepo = new EvalResultRepository(db);
		const scoreRepo = new ScoreRepository(db);

		const project = await projectRepo.create({ name: "Pending Test" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Pending Dataset",
		});

		const run = await evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 5000,
			},
			totalCases: 0,
		});

		const engine = new RescoringEngine({
			scorers: [new ExactMatchScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		await expect(engine.execute(run.id)).rejects.toThrow('has status "pending"');
	});

	it("should reject rescoring a non-existent run", async () => {
		const db = createInMemoryDB();
		initializeDB(db);

		const evalRunRepo = new EvalRunRepository(db);
		const evalResultRepo = new EvalResultRepository(db);
		const scoreRepo = new ScoreRepository(db);

		const engine = new RescoringEngine({
			scorers: [new ExactMatchScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
		});

		await expect(engine.execute("nonexistent-id")).rejects.toThrow('"nonexistent-id" not found');
	});
});
