import { beforeEach, describe, expect, it } from "vitest";
import type { LLMBenchDB } from "../client.js";
import { createInMemoryDB, initializeDB } from "../client.js";
import { CostRecordRepository } from "../repositories/cost-record-repository.js";
import { DatasetRepository } from "../repositories/dataset-repository.js";
import { EvalResultRepository } from "../repositories/eval-result-repository.js";
import { EvalRunRepository } from "../repositories/eval-run-repository.js";
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
