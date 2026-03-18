import { beforeEach, describe, expect, it } from "vitest";
import type { LLMBenchDB } from "../client.js";
import { createInMemoryDB, initializeDB } from "../client.js";
import { CacheRepository } from "../repositories/cache-repository.js";
import { CostRecordRepository } from "../repositories/cost-record-repository.js";
import { DatasetRepository } from "../repositories/dataset-repository.js";
import { EvalResultRepository } from "../repositories/eval-result-repository.js";
import { EvalRunRepository } from "../repositories/eval-run-repository.js";
import { EventRepository } from "../repositories/event-repository.js";
import { ProjectRepository } from "../repositories/project-repository.js";
import { ProviderRepository } from "../repositories/provider-repository.js";
import { ScoreRepository } from "../repositories/score-repository.js";
import { TestCaseRepository } from "../repositories/test-case-repository.js";

let db: LLMBenchDB;

beforeEach(() => {
	db = createInMemoryDB();
	initializeDB(db);
});

describe("ProjectRepository", () => {
	it("should create and find a project", async () => {
		const repo = new ProjectRepository(db);
		const project = await repo.create({ name: "Test Project", description: "A test" });

		expect(project.name).toBe("Test Project");
		expect(project.description).toBe("A test");
		expect(project.id).toBeDefined();

		const found = await repo.findById(project.id);
		expect(found).toEqual(project);
	});

	it("should list all projects", async () => {
		const repo = new ProjectRepository(db);
		await repo.create({ name: "Project 1" });
		await repo.create({ name: "Project 2" });

		const all = await repo.findAll();
		expect(all).toHaveLength(2);
	});

	it("should update a project", async () => {
		const repo = new ProjectRepository(db);
		const project = await repo.create({ name: "Old Name" });
		const updated = await repo.update(project.id, { name: "New Name" });

		expect(updated?.name).toBe("New Name");
	});

	it("should delete a project", async () => {
		const repo = new ProjectRepository(db);
		const project = await repo.create({ name: "To Delete" });

		const deleted = await repo.delete(project.id);
		expect(deleted).toBe(true);

		const found = await repo.findById(project.id);
		expect(found).toBeNull();
	});
});

describe("DatasetRepository", () => {
	it("should create and find a dataset", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new DatasetRepository(db);

		const dataset = await repo.create({
			projectId: project.id,
			name: "My Dataset",
			description: "Test dataset",
		});

		expect(dataset.name).toBe("My Dataset");
		expect(dataset.projectId).toBe(project.id);

		const found = await repo.findById(dataset.id);
		expect(found).toEqual(dataset);
	});

	it("should find datasets by project", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new DatasetRepository(db);

		await repo.create({ projectId: project.id, name: "Dataset 1" });
		await repo.create({ projectId: project.id, name: "Dataset 2" });

		const datasets = await repo.findByProjectId(project.id);
		expect(datasets).toHaveLength(2);
	});

	it("should create dataset with contentHash and custom version", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new DatasetRepository(db);

		const dataset = await repo.create({
			projectId: project.id,
			name: "Versioned DS",
			contentHash: "abc123hash",
			version: 3,
		});

		expect(dataset.contentHash).toBe("abc123hash");
		expect(dataset.version).toBe(3);

		const found = await repo.findById(dataset.id);
		expect(found?.contentHash).toBe("abc123hash");
		expect(found?.version).toBe(3);
	});

	it("should update dataset with contentHash", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new DatasetRepository(db);

		const dataset = await repo.create({ projectId: project.id, name: "DS" });
		expect(dataset.contentHash).toBeUndefined();

		const updated = await repo.update(dataset.id, { contentHash: "newhash456" });
		expect(updated?.contentHash).toBe("newhash456");
	});

	it("should find datasets by name in project sorted by version DESC", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new DatasetRepository(db);

		await repo.create({ projectId: project.id, name: "Same Name", version: 1, contentHash: "h1" });
		await repo.create({ projectId: project.id, name: "Same Name", version: 3, contentHash: "h3" });
		await repo.create({ projectId: project.id, name: "Same Name", version: 2, contentHash: "h2" });
		await repo.create({ projectId: project.id, name: "Other", version: 1, contentHash: "h4" });

		const results = await repo.findByNameInProject(project.id, "Same Name");
		expect(results).toHaveLength(3);
		expect(results[0].version).toBe(3);
		expect(results[1].version).toBe(2);
		expect(results[2].version).toBe(1);
	});
});

describe("TestCaseRepository", () => {
	it("should create and find test cases", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const repo = new TestCaseRepository(db);

		const tc = await repo.create({
			datasetId: dataset.id,
			input: "What is 2+2?",
			expected: "4",
			tags: ["math"],
		});

		expect(tc.input).toBe("What is 2+2?");
		expect(tc.tags).toEqual(["math"]);

		const found = await repo.findByDatasetId(dataset.id);
		expect(found).toHaveLength(1);
		expect(found[0].input).toBe("What is 2+2?");
	});

	it("should create many test cases", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const repo = new TestCaseRepository(db);

		const cases = await repo.createMany([
			{ datasetId: dataset.id, input: "Q1", expected: "A1" },
			{ datasetId: dataset.id, input: "Q2", expected: "A2" },
			{ datasetId: dataset.id, input: "Q3", expected: "A3" },
		]);

		expect(cases).toHaveLength(3);
		expect(cases[0].orderIndex).toBe(0);
		expect(cases[2].orderIndex).toBe(2);
	});
});

describe("ProviderRepository", () => {
	it("should create and find providers", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const repo = new ProviderRepository(db);

		const provider = await repo.create({
			projectId: project.id,
			type: "openai",
			name: "GPT-4",
			model: "gpt-4",
			config: { temperature: 0.7 },
		});

		expect(provider.type).toBe("openai");
		expect(provider.model).toBe("gpt-4");

		const found = await repo.findById(provider.id);
		expect(found?.config).toEqual({ temperature: 0.7 });
	});
});

describe("EvalRunRepository", () => {
	it("should create and update run status", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const repo = new EvalRunRepository(db);

		const run = await repo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: ["p1"],
				scorerConfigs: [],
				concurrency: 5,
				maxRetries: 3,
				timeoutMs: 30000,
			},
			totalCases: 10,
		});

		expect(run.status).toBe("pending");

		await repo.updateStatus(run.id, "running");
		const updated = await repo.findById(run.id);
		expect(updated?.status).toBe("running");

		await repo.updateProgress(run.id, { completedCases: 5, totalCost: 0.05 });
		const progressed = await repo.findById(run.id);
		expect(progressed?.completedCases).toBe(5);
		expect(progressed?.totalCost).toBe(0.05);
	});

	it("should create run with datasetVersion", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const repo = new EvalRunRepository(db);

		const run = await repo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: ["p1"],
				scorerConfigs: [],
				concurrency: 5,
				maxRetries: 3,
				timeoutMs: 30000,
			},
			totalCases: 10,
			datasetVersion: 3,
		});

		expect(run.datasetVersion).toBe(3);

		const found = await repo.findById(run.id);
		expect(found?.datasetVersion).toBe(3);
	});
});

describe("EvalResultRepository", () => {
	it("should create and find results", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const tcRepo = new TestCaseRepository(db);
		const tc = await tcRepo.create({ datasetId: dataset.id, input: "Q", expected: "A" });
		const providerRepo = new ProviderRepository(db);
		const provider = await providerRepo.create({
			projectId: project.id,
			type: "openai",
			name: "GPT-4",
			model: "gpt-4",
		});
		const runRepo = new EvalRunRepository(db);
		const run = await runRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provider.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 30000,
			},
			totalCases: 1,
		});
		const repo = new EvalResultRepository(db);

		const result = await repo.create({
			runId: run.id,
			testCaseId: tc.id,
			providerId: provider.id,
			input: "Q",
			output: "A",
			expected: "A",
			latencyMs: 150,
			inputTokens: 10,
			outputTokens: 5,
			totalTokens: 15,
			cost: 0.001,
		});

		expect(result.output).toBe("A");
		expect(result.latencyMs).toBe(150);

		const found = await repo.findByRunId(run.id);
		expect(found).toHaveLength(1);
	});
});

describe("ScoreRepository", () => {
	it("should create and find scores", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const tcRepo = new TestCaseRepository(db);
		const tc = await tcRepo.create({ datasetId: dataset.id, input: "Q", expected: "A" });
		const providerRepo = new ProviderRepository(db);
		const provider = await providerRepo.create({
			projectId: project.id,
			type: "openai",
			name: "GPT-4",
			model: "gpt-4",
		});
		const runRepo = new EvalRunRepository(db);
		const run = await runRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provider.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 30000,
			},
			totalCases: 1,
		});
		const resultRepo = new EvalResultRepository(db);
		const result = await resultRepo.create({
			runId: run.id,
			testCaseId: tc.id,
			providerId: provider.id,
			input: "Q",
			output: "A",
			expected: "A",
			latencyMs: 100,
			inputTokens: 10,
			outputTokens: 5,
			totalTokens: 15,
		});

		const repo = new ScoreRepository(db);
		await repo.create(result.id, {
			scorerId: "exact-match",
			scorerName: "Exact Match",
			scorerType: "exact-match",
			value: 1.0,
			reason: "Output matches expected",
		});

		const found = await repo.findByResultId(result.id);
		expect(found).toHaveLength(1);
		expect(found[0].value).toBe(1.0);
		expect(found[0].scorerName).toBe("Exact Match");
	});

	it("should find scores by run ID grouped by result ID", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const tcRepo = new TestCaseRepository(db);
		const tc1 = await tcRepo.create({ datasetId: dataset.id, input: "Q1", expected: "A1" });
		const tc2 = await tcRepo.create({ datasetId: dataset.id, input: "Q2", expected: "A2" });
		const providerRepo = new ProviderRepository(db);
		const provider = await providerRepo.create({
			projectId: project.id,
			type: "openai",
			name: "GPT-4",
			model: "gpt-4",
		});
		const runRepo = new EvalRunRepository(db);
		const run = await runRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provider.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 30000,
			},
			totalCases: 2,
		});
		const resultRepo = new EvalResultRepository(db);
		const result1 = await resultRepo.create({
			runId: run.id,
			testCaseId: tc1.id,
			providerId: provider.id,
			input: "Q1",
			output: "A1",
			expected: "A1",
			latencyMs: 100,
			inputTokens: 10,
			outputTokens: 5,
			totalTokens: 15,
		});
		const result2 = await resultRepo.create({
			runId: run.id,
			testCaseId: tc2.id,
			providerId: provider.id,
			input: "Q2",
			output: "wrong",
			expected: "A2",
			latencyMs: 120,
			inputTokens: 12,
			outputTokens: 6,
			totalTokens: 18,
		});

		const repo = new ScoreRepository(db);
		await repo.create(result1.id, {
			scorerId: "exact-match",
			scorerName: "Exact Match",
			scorerType: "exact-match",
			value: 1.0,
		});
		await repo.create(result1.id, {
			scorerId: "contains",
			scorerName: "Contains",
			scorerType: "contains",
			value: 1.0,
		});
		await repo.create(result2.id, {
			scorerId: "exact-match",
			scorerName: "Exact Match",
			scorerType: "exact-match",
			value: 0.0,
		});

		const scoresByResult = await repo.findByRunId(run.id);

		expect(Object.keys(scoresByResult)).toHaveLength(2);
		expect(scoresByResult[result1.id]).toHaveLength(2);
		expect(scoresByResult[result2.id]).toHaveLength(1);
		expect(scoresByResult[result1.id][0].scorerName).toBe("Exact Match");
		expect(scoresByResult[result2.id][0].value).toBe(0.0);
	});

	it("should return empty object when no scores exist for run", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const runRepo = new EvalRunRepository(db);
		const run = await runRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: ["p1"],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 30000,
			},
			totalCases: 0,
		});

		const repo = new ScoreRepository(db);
		const scoresByResult = await repo.findByRunId(run.id);

		expect(Object.keys(scoresByResult)).toHaveLength(0);
	});
});

describe("CostRecordRepository", () => {
	it("should create and find cost records", async () => {
		const projectRepo = new ProjectRepository(db);
		const project = await projectRepo.create({ name: "Test" });
		const datasetRepo = new DatasetRepository(db);
		const dataset = await datasetRepo.create({ projectId: project.id, name: "DS" });
		const providerRepo = new ProviderRepository(db);
		const provider = await providerRepo.create({
			projectId: project.id,
			type: "openai",
			name: "GPT-4",
			model: "gpt-4",
		});
		const runRepo = new EvalRunRepository(db);
		const run = await runRepo.create({
			projectId: project.id,
			datasetId: dataset.id,
			config: {
				providerIds: [provider.id],
				scorerConfigs: [],
				concurrency: 1,
				maxRetries: 0,
				timeoutMs: 30000,
			},
			totalCases: 1,
		});

		const repo = new CostRecordRepository(db);
		await repo.create({
			runId: run.id,
			providerId: provider.id,
			model: "gpt-4",
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
			inputCost: 0.03,
			outputCost: 0.06,
			totalCost: 0.09,
		});

		const found = await repo.findByRunId(run.id);
		expect(found).toHaveLength(1);
		expect(found[0].totalCost).toBe(0.09);
	});
});

describe("CacheRepository", () => {
	it("should create and find a cache entry by key", async () => {
		const repo = new CacheRepository(db);
		const entry = await repo.create({
			cacheKey: "abc123",
			model: "gpt-4",
			input: "Hello",
			output: "Hi there!",
			tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
			latencyMs: 150,
		});

		expect(entry.cacheKey).toBe("abc123");
		expect(entry.model).toBe("gpt-4");
		expect(entry.output).toBe("Hi there!");
		expect(entry.hits).toBe(0);

		const found = await repo.findByKey("abc123");
		expect(found).not.toBeNull();
		expect(found?.output).toBe("Hi there!");
		expect(found?.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 3, totalTokens: 8 });
	});

	it("should return null for non-existent key", async () => {
		const repo = new CacheRepository(db);
		const found = await repo.findByKey("nonexistent");
		expect(found).toBeNull();
	});

	it("should increment hits", async () => {
		const repo = new CacheRepository(db);
		const entry = await repo.create({
			cacheKey: "hit-test",
			model: "gpt-4",
			input: "Q",
			output: "A",
		});

		await repo.incrementHits(entry.id);
		await repo.incrementHits(entry.id);

		const found = await repo.findByKey("hit-test");
		expect(found?.hits).toBe(2);
	});

	it("should delete expired entries", async () => {
		const repo = new CacheRepository(db);

		// Create an expired entry
		await repo.create({
			cacheKey: "expired",
			model: "gpt-4",
			input: "Q",
			output: "A",
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		});

		// Create a non-expired entry
		await repo.create({
			cacheKey: "valid",
			model: "gpt-4",
			input: "Q2",
			output: "A2",
			expiresAt: new Date(Date.now() + 86400000).toISOString(),
		});

		const deleted = await repo.deleteExpired();
		expect(deleted).toBe(1);

		const count = await repo.count();
		expect(count).toBe(1);

		const found = await repo.findByKey("valid");
		expect(found).not.toBeNull();
	});

	it("should delete all entries", async () => {
		const repo = new CacheRepository(db);
		await repo.create({ cacheKey: "a", model: "gpt-4", input: "Q1", output: "A1" });
		await repo.create({ cacheKey: "b", model: "gpt-4", input: "Q2", output: "A2" });

		const deleted = await repo.deleteAll();
		expect(deleted).toBe(2);

		const count = await repo.count();
		expect(count).toBe(0);
	});

	it("should count entries", async () => {
		const repo = new CacheRepository(db);
		expect(await repo.count()).toBe(0);

		await repo.create({ cacheKey: "a", model: "gpt-4", input: "Q", output: "A" });
		expect(await repo.count()).toBe(1);

		await repo.create({ cacheKey: "b", model: "gpt-4", input: "Q", output: "A" });
		expect(await repo.count()).toBe(2);
	});

	it("should not delete entries without expiresAt when deleting expired", async () => {
		const repo = new CacheRepository(db);

		// Entry without expiresAt (no TTL, should never expire)
		await repo.create({ cacheKey: "permanent", model: "gpt-4", input: "Q", output: "A" });

		// Entry that expired
		await repo.create({
			cacheKey: "expired",
			model: "gpt-4",
			input: "Q2",
			output: "A2",
			expiresAt: new Date(Date.now() - 1000).toISOString(),
		});

		const deleted = await repo.deleteExpired();
		expect(deleted).toBe(1);

		const count = await repo.count();
		expect(count).toBe(1);

		const permanent = await repo.findByKey("permanent");
		expect(permanent).not.toBeNull();
	});

	it("should reject duplicate cache keys", async () => {
		const repo = new CacheRepository(db);
		await repo.create({ cacheKey: "dup", model: "gpt-4", input: "Q", output: "A" });

		await expect(
			repo.create({ cacheKey: "dup", model: "gpt-4", input: "Q2", output: "A2" }),
		).rejects.toThrow();
	});

	it("should handle entry without tokenUsage", async () => {
		const repo = new CacheRepository(db);
		const entry = await repo.create({
			cacheKey: "no-tokens",
			model: "gpt-4",
			input: "Q",
			output: "A",
		});

		expect(entry.tokenUsage).toBeUndefined();

		const found = await repo.findByKey("no-tokens");
		expect(found?.tokenUsage).toBeUndefined();
	});
});

describe("EventRepository", () => {
	it("should insert and find events by cursor", async () => {
		const repo = new EventRepository(db);

		const e1 = repo.insert({
			runId: "run-1",
			eventType: "run:started",
			payload: JSON.stringify({ type: "run:started", runId: "run-1" }),
			timestamp: new Date().toISOString(),
		});
		const e2 = repo.insert({
			runId: "run-1",
			eventType: "run:progress",
			payload: JSON.stringify({ type: "run:progress", runId: "run-1" }),
			timestamp: new Date().toISOString(),
		});

		expect(e1.seq).toBeDefined();
		expect(e2.seq).toBeGreaterThan(e1.seq);

		const events = repo.findAfterCursor("run-1", 0);
		expect(events).toHaveLength(2);
		expect(events[0].eventType).toBe("run:started");
		expect(events[1].eventType).toBe("run:progress");
	});

	it("should support cursor-based pagination", async () => {
		const repo = new EventRepository(db);

		const e1 = repo.insert({
			runId: "run-1",
			eventType: "run:started",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});
		repo.insert({
			runId: "run-1",
			eventType: "run:progress",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});
		repo.insert({
			runId: "run-1",
			eventType: "run:completed",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});

		// After first event — should get 2 remaining
		const after = repo.findAfterCursor("run-1", e1.seq);
		expect(after).toHaveLength(2);
		expect(after[0].eventType).toBe("run:progress");
	});

	it("should scope events by runId (no cross-run leakage)", async () => {
		const repo = new EventRepository(db);

		repo.insert({
			runId: "run-1",
			eventType: "run:started",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});
		repo.insert({
			runId: "run-2",
			eventType: "run:started",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});

		const run1Events = repo.findAfterCursor("run-1", 0);
		expect(run1Events).toHaveLength(1);
		expect(run1Events[0].runId).toBe("run-1");

		const run2Events = repo.findAfterCursor("run-2", 0);
		expect(run2Events).toHaveLength(1);
		expect(run2Events[0].runId).toBe("run-2");
	});

	it("should delete events by runId", async () => {
		const repo = new EventRepository(db);

		repo.insert({
			runId: "run-1",
			eventType: "run:started",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});
		repo.insert({
			runId: "run-1",
			eventType: "run:completed",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});
		repo.insert({
			runId: "run-2",
			eventType: "run:started",
			payload: "{}",
			timestamp: new Date().toISOString(),
		});

		const deleted = repo.deleteByRunId("run-1");
		expect(deleted).toBe(2);

		const remaining = repo.findAfterCursor("run-1", 0);
		expect(remaining).toHaveLength(0);

		// run-2 events should be unaffected
		const run2Events = repo.findAfterCursor("run-2", 0);
		expect(run2Events).toHaveLength(1);
	});

	it("should return empty result for nonexistent run", async () => {
		const repo = new EventRepository(db);
		const events = repo.findAfterCursor("nonexistent", 0);
		expect(events).toHaveLength(0);
	});

	it("should respect limit parameter", async () => {
		const repo = new EventRepository(db);

		for (let i = 0; i < 5; i++) {
			repo.insert({
				runId: "run-1",
				eventType: "run:progress",
				payload: "{}",
				timestamp: new Date().toISOString(),
			});
		}

		const limited = repo.findAfterCursor("run-1", 0, 2);
		expect(limited).toHaveLength(2);
	});
});
