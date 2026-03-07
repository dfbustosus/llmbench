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
import type { EvalEvent } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import { CostCalculator } from "../cost/cost-calculator.js";
import { EvaluationEngine } from "../engine/evaluation-engine.js";
import { CustomProvider } from "../providers/custom-provider.js";
import { ContainsScorer } from "../scorers/deterministic/contains.js";
import { ExactMatchScorer } from "../scorers/deterministic/exact-match.js";

describe("Integration: full evaluation pipeline", () => {
	it("should run an evaluation end-to-end with a custom provider", async () => {
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

		// Create parent records to satisfy FK constraints
		const project = await projectRepo.create({ name: "Test Project" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Test Dataset",
		});

		const tc1 = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is the capital of France?",
			expected: "Paris",
			orderIndex: 0,
		});
		const tc2 = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is the meaning of life?",
			expected: "42",
			orderIndex: 1,
		});

		const provRecord = await providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "MockLLM",
			model: "mock-v1",
			config: {},
		});

		// Create mock provider that echoes canned responses
		const mockProvider = new CustomProvider(
			{ type: "custom", name: "MockLLM", model: "mock-v1" },
			async (input) => ({
				output: input.includes("capital") ? "Paris" : "42",
				latencyMs: 50,
				tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
			}),
		);

		const providers = new Map([[provRecord.id, mockProvider]]);
		const scorers = [new ExactMatchScorer(), new ContainsScorer()];

		const engine = new EvaluationEngine({
			providers,
			scorers,
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
			costRecordRepo,
			costCalculator: new CostCalculator(),
		});

		// Collect events
		const events: EvalEvent[] = [];
		engine.onEvent((e) => events.push(e));

		// Create run
		const run = await evalRunRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provRecord.id],
				scorerConfigs: [],
				concurrency: 2,
				maxRetries: 1,
				timeoutMs: 5000,
			},
			totalCases: 2,
		});

		const testCases = [tc1, tc2];

		// Execute the full pipeline
		await engine.execute(run, testCases);

		// Verify run completed
		const finalRun = await evalRunRepo.findById(run.id);
		expect(finalRun).toBeDefined();
		expect(finalRun?.status).toBe("completed");
		expect(finalRun?.completedCases).toBe(2);
		expect(finalRun?.failedCases).toBe(0);

		// Verify results were saved
		const results = await evalResultRepo.findByRunId(run.id);
		expect(results).toHaveLength(2);

		const parisResult = results.find((r) => r.input.includes("capital"));
		expect(parisResult).toBeDefined();
		expect(parisResult?.output).toBe("Paris");
		expect(parisResult?.error).toBeUndefined();

		// Verify scores (2 scorers x 2 results = 4)
		const allScores = [];
		for (const result of results) {
			const scores = await scoreRepo.findByResultId(result.id);
			allScores.push(...scores);
		}
		expect(allScores).toHaveLength(4);

		// Verify exact match gave 1.0 for "Paris"
		const parisExact = allScores.find((s) => s.scorerName === "Exact Match" && s.value === 1);
		expect(parisExact).toBeDefined();

		// Verify events
		const eventTypes = events.map((e) => e.type);
		expect(eventTypes[0]).toBe("run:started");
		expect(eventTypes[eventTypes.length - 1]).toBe("run:completed");
		expect(eventTypes).toContain("case:started");
		expect(eventTypes).toContain("case:completed");
		expect(eventTypes).toContain("run:progress");
	});

	it("should handle provider errors gracefully", async () => {
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

		const project = await projectRepo.create({ name: "Fail Project" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Fail Dataset",
		});
		const tc = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "test",
			expected: "test",
			orderIndex: 0,
		});
		const provRecord = await providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "FailLLM",
			model: "fail-v1",
			config: {},
		});

		const failingProvider = new CustomProvider(
			{ type: "custom", name: "FailLLM", model: "fail-v1" },
			async () => ({
				output: "",
				latencyMs: 10,
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				error: "Rate limit exceeded",
			}),
		);

		const engine = new EvaluationEngine({
			providers: new Map([[provRecord.id, failingProvider]]),
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
			totalCases: 1,
		});

		await engine.execute(run, [tc]);

		const finalRun = await evalRunRepo.findById(run.id);
		expect(finalRun?.status).toBe("failed");
		expect(finalRun?.failedCases).toBe(1);

		const results = await evalResultRepo.findByRunId(run.id);
		expect(results).toHaveLength(1);
		expect(results[0].error).toBe("Rate limit exceeded");
	});
});
