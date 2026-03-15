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
import { describe, expect, it } from "vitest";
import { CostCalculator } from "../cost/cost-calculator.js";
import { EvaluationEngine } from "../engine/evaluation-engine.js";
import { CustomProvider } from "../providers/custom-provider.js";
import { ContainsScorer } from "../scorers/deterministic/contains.js";
import { ExactMatchScorer } from "../scorers/deterministic/exact-match.js";

describe("Per-test-case assertions", () => {
	function setup() {
		const db = createInMemoryDB();
		initializeDB(db);

		return {
			db,
			projectRepo: new ProjectRepository(db),
			datasetRepo: new DatasetRepository(db),
			testCaseRepo: new TestCaseRepository(db),
			providerRepo: new ProviderRepository(db),
			evalRunRepo: new EvalRunRepository(db),
			evalResultRepo: new EvalResultRepository(db),
			scoreRepo: new ScoreRepository(db),
			costRecordRepo: new CostRecordRepository(db),
		};
	}

	it("should use inline assertions instead of global scorers", async () => {
		const repos = setup();

		const project = await repos.projectRepo.create({ name: "Assert Project" });
		const dataset = await repos.datasetRepo.create({
			projectId: project.id,
			name: "Assert Dataset",
		});

		// Test case with inline assertions — should use "contains" on value "Paris"
		const tc = await repos.testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is the capital of France?",
			expected: "Paris is the capital",
			assert: [
				{ type: "contains", value: "Paris" },
				{ type: "exact-match", value: "Paris" },
			],
			orderIndex: 0,
		});

		const provRecord = await repos.providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "MockLLM",
			model: "mock-v1",
			config: {},
		});

		const mockProvider = new CustomProvider(
			{ type: "custom", name: "MockLLM", model: "mock-v1" },
			async () => ({
				output: "Paris",
				latencyMs: 50,
				tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			}),
		);

		// Global scorer is ExactMatch — but should be overridden by inline assertions
		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer()],
			evalRunRepo: repos.evalRunRepo,
			evalResultRepo: repos.evalResultRepo,
			scoreRepo: repos.scoreRepo,
			costRecordRepo: repos.costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		const run = await repos.evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provRecord.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 5000,
			},
			totalCases: 1,
		});

		await engine.execute(run, [tc]);

		const results = await repos.evalResultRepo.findByRunId(run.id);
		expect(results).toHaveLength(1);
		expect(results[0].output).toBe("Paris");

		const scores = await repos.scoreRepo.findByResultId(results[0].id);
		// Should have 2 scores from inline assertions, not 1 from global ExactMatch
		expect(scores).toHaveLength(2);

		// contains "Paris" in "Paris" => 1.0
		const containsScore = scores.find((s) => s.scorerType === "contains");
		expect(containsScore).toBeDefined();
		expect(containsScore?.value).toBe(1);

		// exact-match "Paris" vs "Paris" => 1.0 (assertion value is "Paris", not "Paris is the capital")
		const exactScore = scores.find((s) => s.scorerType === "exact-match");
		expect(exactScore).toBeDefined();
		expect(exactScore?.value).toBe(1);
	});

	it("should fall back to global scorers when no assertions", async () => {
		const repos = setup();

		const project = await repos.projectRepo.create({ name: "Global Scorer Project" });
		const dataset = await repos.datasetRepo.create({
			projectId: project.id,
			name: "No Assert Dataset",
		});

		// No assert field — global scorers should be used
		const tc = await repos.testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is 2+2?",
			expected: "4",
			orderIndex: 0,
		});

		const provRecord = await repos.providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "MockLLM",
			model: "mock-v1",
			config: {},
		});

		const mockProvider = new CustomProvider(
			{ type: "custom", name: "MockLLM", model: "mock-v1" },
			async () => ({
				output: "4",
				latencyMs: 30,
				tokenUsage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
			}),
		);

		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer(), new ContainsScorer()],
			evalRunRepo: repos.evalRunRepo,
			evalResultRepo: repos.evalResultRepo,
			scoreRepo: repos.scoreRepo,
			costRecordRepo: repos.costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		const run = await repos.evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provRecord.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 5000,
			},
			totalCases: 1,
		});

		await engine.execute(run, [tc]);

		const results = await repos.evalResultRepo.findByRunId(run.id);
		const scores = await repos.scoreRepo.findByResultId(results[0].id);

		// 2 global scorers
		expect(scores).toHaveLength(2);
		expect(scores.find((s) => s.scorerType === "exact-match")).toBeDefined();
		expect(scores.find((s) => s.scorerType === "contains")).toBeDefined();
	});

	it("should mix test cases with and without assertions", async () => {
		const repos = setup();

		const project = await repos.projectRepo.create({ name: "Mixed Project" });
		const dataset = await repos.datasetRepo.create({
			projectId: project.id,
			name: "Mixed Dataset",
		});

		// tc1 has inline assertions
		const tc1 = await repos.testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is the capital of France?",
			expected: "",
			assert: [{ type: "contains", value: "Paris" }],
			orderIndex: 0,
		});

		// tc2 has no assertions — uses global scorers
		const tc2 = await repos.testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is 2+2?",
			expected: "4",
			orderIndex: 1,
		});

		const provRecord = await repos.providerRepo.create({
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
					latencyMs: 40,
					tokenUsage: { inputTokens: 8, outputTokens: 3, totalTokens: 11 },
				};
			},
		);

		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer()], // 1 global scorer
			evalRunRepo: repos.evalRunRepo,
			evalResultRepo: repos.evalResultRepo,
			scoreRepo: repos.scoreRepo,
			costRecordRepo: repos.costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		const run = await repos.evalRunRepo.create({
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

		const results = await repos.evalResultRepo.findByRunId(run.id);
		expect(results).toHaveLength(2);

		// tc1 (assertions): 1 assertion scorer
		const tc1Result = results.find((r) => r.input.includes("capital"));
		expect(tc1Result).toBeDefined();
		const tc1Scores = await repos.scoreRepo.findByResultId(tc1Result?.id as string);
		expect(tc1Scores).toHaveLength(1);
		expect(tc1Scores[0].scorerType).toBe("contains");

		// tc2 (global): 1 global scorer
		const tc2Result = results.find((r) => r.input.includes("2+2"));
		expect(tc2Result).toBeDefined();
		const tc2Scores = await repos.scoreRepo.findByResultId(tc2Result?.id as string);
		expect(tc2Scores).toHaveLength(1);
		expect(tc2Scores[0].scorerType).toBe("exact-match");
	});

	it("should reject llm-judge as inline assertion", async () => {
		const repos = setup();

		const project = await repos.projectRepo.create({ name: "LLM Judge Assert" });
		const dataset = await repos.datasetRepo.create({
			projectId: project.id,
			name: "Judge Dataset",
		});

		const tc = await repos.testCaseRepo.create({
			datasetId: dataset.id,
			input: "test",
			expected: "",
			assert: [{ type: "llm-judge", value: "Is the response helpful?" }],
			orderIndex: 0,
		});

		const provRecord = await repos.providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "MockLLM",
			model: "mock-v1",
			config: {},
		});

		const mockProvider = new CustomProvider(
			{ type: "custom", name: "MockLLM", model: "mock-v1" },
			async () => ({
				output: "some output",
				latencyMs: 50,
				tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			}),
		);

		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [],
			evalRunRepo: repos.evalRunRepo,
			evalResultRepo: repos.evalResultRepo,
			scoreRepo: repos.scoreRepo,
			costRecordRepo: repos.costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		const run = await repos.evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provRecord.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 5000,
			},
			totalCases: 1,
		});

		// The engine should handle this error gracefully (case:failed)
		await engine.execute(run, [tc]);

		const finalRun = await repos.evalRunRepo.findById(run.id);
		expect(finalRun?.failedCases).toBe(1);

		const results = await repos.evalResultRepo.findByRunId(run.id);
		expect(results[0].error).toContain("cannot be used as an inline assertion");
	});
});
