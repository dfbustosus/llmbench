import { createHash } from "node:crypto";
import {
	CacheRepository,
	CostRecordRepository,
	createInMemoryDB,
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
import type { EvalEvent } from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import { CostCalculator } from "../cost/cost-calculator.js";
import { CacheManager } from "../engine/cache-manager.js";
import { EvaluationEngine } from "../engine/evaluation-engine.js";
import { EventPersister } from "../engine/event-persister.js";
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
			async (input) => {
				const text = typeof input === "string" ? input : input.map((m) => m.content).join(" ");
				return {
					output: text.includes("capital") ? "Paris" : "42",
					latencyMs: 50,
					tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				};
			},
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

	it("should use cache to skip provider calls on second run", async () => {
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
		const cacheRepo = new CacheRepository(db);

		const project = await projectRepo.create({ name: "Cache Test" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Cache Dataset",
		});

		const tc = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is 1+1?",
			expected: "2",
			orderIndex: 0,
		});

		const provRecord = await providerRepo.create({
			projectId: project.id,
			type: "custom",
			name: "CacheLLM",
			model: "cache-v1",
			config: {},
		});

		const generateFn = vi.fn(async () => ({
			output: "2",
			latencyMs: 100,
			tokenUsage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
		}));

		const mockProvider = new CustomProvider(
			{ type: "custom", name: "CacheLLM", model: "cache-v1" },
			generateFn,
		);

		const cacheManager = new CacheManager(cacheRepo);

		// First run — should call provider
		const engine1 = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
			costRecordRepo,
			costCalculator: new CostCalculator(),
			cacheManager,
		});

		const run1 = await evalRunRepo.create({
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

		await engine1.execute(run1, [tc]);
		expect(generateFn).toHaveBeenCalledTimes(1);
		expect(engine1.getCacheHits()).toBe(0);

		// Second run — should use cache, not call provider again
		const engine2 = new EvaluationEngine({
			providers: new Map([[provRecord.id, mockProvider]]),
			scorers: [new ExactMatchScorer()],
			evalRunRepo,
			evalResultRepo,
			scoreRepo,
			costRecordRepo,
			costCalculator: new CostCalculator(),
			cacheManager,
		});

		const run2 = await evalRunRepo.create({
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

		await engine2.execute(run2, [tc]);
		expect(generateFn).toHaveBeenCalledTimes(1); // Still 1 — not called again
		expect(engine2.getCacheHits()).toBe(1);

		// Verify cached result has 0 latency
		const results = await evalResultRepo.findByRunId(run2.id);
		expect(results).toHaveLength(1);
		expect(results[0].latencyMs).toBe(0);
		expect(results[0].output).toBe("2");

		// Verify cache entry count
		const cacheCount = await cacheRepo.count();
		expect(cacheCount).toBe(1);
	});

	it("should persist events to DB via EventPersister", async () => {
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
		const eventRepo = new EventRepository(db);

		const project = await projectRepo.create({ name: "Persist Test" });
		const dataset = await datasetRepo.create({
			projectId: project.id,
			name: "Persist Dataset",
		});

		const tc = await testCaseRepo.create({
			datasetId: dataset.id,
			input: "What is 1+1?",
			expected: "2",
			orderIndex: 0,
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
			async () => ({
				output: "2",
				latencyMs: 10,
				tokenUsage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 },
			}),
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

		// Wire EventPersister
		const persister = new EventPersister(eventRepo);
		engine.onEvent(persister.handler());

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

		// Verify events were persisted in correct order
		const dbEvents = eventRepo.findAfterCursor(run.id, 0);
		expect(dbEvents.length).toBeGreaterThanOrEqual(3);

		const eventTypes = dbEvents.map((e) => e.eventType);
		expect(eventTypes[0]).toBe("run:started");
		expect(eventTypes[eventTypes.length - 1]).toBe("run:completed");
		expect(eventTypes).toContain("run:progress");

		// Verify seq is monotonically increasing
		for (let i = 1; i < dbEvents.length; i++) {
			expect(dbEvents[i].seq).toBeGreaterThan(dbEvents[i - 1].seq);
		}

		// Verify payload is valid JSON
		for (const ev of dbEvents) {
			const payload = JSON.parse(ev.payload);
			expect(payload.type).toBe(ev.eventType);
			expect(payload.runId).toBe(run.id);
		}
	});
});

// Helper functions mirroring the CLI's computeContentHash logic
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
	}>,
): string {
	const semantic = testCases.map((tc) => ({
		input: tc.input,
		expected: tc.expected,
		messages: tc.messages,
		context: tc.context,
		tags: tc.tags,
	}));
	const canonical = JSON.stringify(canonicalize(semantic));
	return createHash("sha256").update(canonical).digest("hex");
}

describe("computeContentHash", () => {
	it("should produce deterministic hashes for the same input", () => {
		const cases = [
			{ input: "What is 2+2?", expected: "4", tags: ["math"] },
			{ input: "Capital of France?", expected: "Paris" },
		];
		const hash1 = computeContentHash(cases);
		const hash2 = computeContentHash(cases);
		expect(hash1).toBe(hash2);
		expect(hash1).toHaveLength(64); // SHA-256 hex
	});

	it("should produce same hash regardless of context key order", () => {
		const cases1 = [{ input: "Q", expected: "A", context: { alpha: 1, beta: "two", gamma: true } }];
		const cases2 = [{ input: "Q", expected: "A", context: { gamma: true, alpha: 1, beta: "two" } }];
		expect(computeContentHash(cases1)).toBe(computeContentHash(cases2));
	});

	it("should detect changes in input, expected, messages, context, and tags", () => {
		const base = [{ input: "Q", expected: "A", context: { key: "val" }, tags: ["t1"] }];
		const changedInput = [{ input: "Q2", expected: "A", context: { key: "val" }, tags: ["t1"] }];
		const changedExpected = [{ input: "Q", expected: "B", context: { key: "val" }, tags: ["t1"] }];
		const changedContext = [{ input: "Q", expected: "A", context: { key: "val2" }, tags: ["t1"] }];
		const changedTags = [{ input: "Q", expected: "A", context: { key: "val" }, tags: ["t2"] }];

		const baseHash = computeContentHash(base);
		expect(computeContentHash(changedInput)).not.toBe(baseHash);
		expect(computeContentHash(changedExpected)).not.toBe(baseHash);
		expect(computeContentHash(changedContext)).not.toBe(baseHash);
		expect(computeContentHash(changedTags)).not.toBe(baseHash);
	});
});

describe("Dataset versioning flow", () => {
	it("should create v1, reuse on unchanged, create v2 on change, and reuse v1 on revert", async () => {
		const db = createInMemoryDB();
		initializeDB(db);

		const projectRepo = new ProjectRepository(db);
		const datasetRepo = new DatasetRepository(db);
		const testCaseRepo = new TestCaseRepository(db);

		const project = await projectRepo.create({ name: "Version Test" });

		const originalCases = [
			{ input: "Q1", expected: "A1" },
			{ input: "Q2", expected: "A2" },
		];

		// Step 1: Create v1
		const hash1 = computeContentHash(originalCases);
		const v1 = await datasetRepo.create({
			projectId: project.id,
			name: "DS",
			contentHash: hash1,
			version: 1,
		});
		await testCaseRepo.createMany(
			originalCases.map((tc, i) => ({
				datasetId: v1.id,
				input: tc.input,
				expected: tc.expected,
				orderIndex: i,
			})),
		);

		expect(v1.version).toBe(1);
		expect(v1.contentHash).toBe(hash1);

		// Step 2: Same content — should match v1
		const versions = await datasetRepo.findByNameInProject(project.id, "DS");
		const matchUnchanged = versions.find((d) => d.contentHash === hash1);
		expect(matchUnchanged).toBeDefined();
		expect(matchUnchanged?.id).toBe(v1.id);

		// Step 3: Changed content — create v2
		const changedCases = [
			{ input: "Q1", expected: "A1" },
			{ input: "Q2", expected: "A2-updated" },
			{ input: "Q3", expected: "A3" },
		];
		const hash2 = computeContentHash(changedCases);
		expect(hash2).not.toBe(hash1);

		const matchChanged = versions.find((d) => d.contentHash === hash2);
		expect(matchChanged).toBeUndefined(); // No match

		const v2 = await datasetRepo.create({
			projectId: project.id,
			name: "DS",
			contentHash: hash2,
			version: 2,
		});
		await testCaseRepo.createMany(
			changedCases.map((tc, i) => ({
				datasetId: v2.id,
				input: tc.input,
				expected: tc.expected,
				orderIndex: i,
			})),
		);
		expect(v2.version).toBe(2);

		// Step 4: Revert to original content — should match v1
		const allVersions = await datasetRepo.findByNameInProject(project.id, "DS");
		expect(allVersions).toHaveLength(2);
		const matchReverted = allVersions.find((d) => d.contentHash === hash1);
		expect(matchReverted).toBeDefined();
		expect(matchReverted?.id).toBe(v1.id);
		expect(matchReverted?.version).toBe(1);

		// Verify test cases are independent per version
		const v1Cases = await testCaseRepo.findByDatasetId(v1.id);
		const v2Cases = await testCaseRepo.findByDatasetId(v2.id);
		expect(v1Cases).toHaveLength(2);
		expect(v2Cases).toHaveLength(3);
	});

	it("should backfill contentHash for legacy datasets", async () => {
		const db = createInMemoryDB();
		initializeDB(db);

		const projectRepo = new ProjectRepository(db);
		const datasetRepo = new DatasetRepository(db);
		const testCaseRepo = new TestCaseRepository(db);

		const project = await projectRepo.create({ name: "Legacy Test" });

		// Create a dataset without contentHash (simulating legacy)
		const legacy = await datasetRepo.create({
			projectId: project.id,
			name: "Legacy DS",
		});
		expect(legacy.contentHash).toBeUndefined();

		await testCaseRepo.createMany([
			{ datasetId: legacy.id, input: "Q1", expected: "A1", orderIndex: 0 },
		]);

		// Backfill: compute hash from DB test cases and store it
		const dbCases = await testCaseRepo.findByDatasetId(legacy.id);
		const backfillHash = computeContentHash(dbCases);
		const updated = await datasetRepo.update(legacy.id, { contentHash: backfillHash });

		expect(updated?.contentHash).toBe(backfillHash);

		// Now the same content should match
		const incomingHash = computeContentHash([{ input: "Q1", expected: "A1" }]);
		expect(incomingHash).toBe(backfillHash);
	});
});
