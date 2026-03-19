import {
	createInMemoryDB,
	DatasetRepository,
	EvalRunRepository,
	EventRepository,
	initializeDB,
	type LLMBenchDB,
	ProjectRepository,
} from "@llmbench/db";
import type { EvalEvent } from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import { EventPersister } from "../engine/event-persister.js";

/** Helper: create parent records so eval_events FK is satisfied, then rename run id */
async function createEvalRun(db: LLMBenchDB, runId: string) {
	const project = await new ProjectRepository(db).create({ name: `proj-${runId}` });
	const dataset = await new DatasetRepository(db).create({
		projectId: project.id,
		name: `ds-${runId}`,
	});
	const run = await new EvalRunRepository(db).create({
		projectId: project.id,
		datasetId: dataset.id,
		config: { providerIds: [], scorerConfigs: [], concurrency: 1, maxRetries: 0, timeoutMs: 30000 },
		totalCases: 0,
	});
	db.run(`UPDATE eval_runs SET id = '${runId}' WHERE id = '${run.id}'`);
}

describe("EventPersister", () => {
	it("should persist events to the repository", async () => {
		const db = createInMemoryDB();
		initializeDB(db);
		await createEvalRun(db, "run-123");
		const repo = new EventRepository(db);
		const persister = new EventPersister(repo);
		const handler = persister.handler();

		const event: EvalEvent = {
			type: "run:started",
			runId: "run-123",
			totalCases: 10,
			timestamp: "2026-01-01T00:00:00.000Z",
		};

		handler(event);

		const rows = repo.findAfterCursor("run-123", 0);
		expect(rows).toHaveLength(1);
		expect(rows[0].eventType).toBe("run:started");
		expect(rows[0].runId).toBe("run-123");

		const payload = JSON.parse(rows[0].payload);
		expect(payload.type).toBe("run:started");
		expect(payload.totalCases).toBe(10);
	});

	it("should not throw when repository insert fails", () => {
		const db = createInMemoryDB();
		initializeDB(db);
		const repo = new EventRepository(db);
		const persister = new EventPersister(repo);
		const handler = persister.handler();

		// Mock insert to throw
		vi.spyOn(repo, "insert").mockImplementation(() => {
			throw new Error("DB write failed");
		});

		const event: EvalEvent = {
			type: "run:started",
			runId: "run-123",
			totalCases: 10,
			timestamp: "2026-01-01T00:00:00.000Z",
		};

		// Should not throw
		expect(() => handler(event)).not.toThrow();
	});

	it("should cleanup events by runId", async () => {
		const db = createInMemoryDB();
		initializeDB(db);
		await createEvalRun(db, "run-cleanup");
		const repo = new EventRepository(db);
		const persister = new EventPersister(repo);
		const handler = persister.handler();

		handler({
			type: "run:started",
			runId: "run-cleanup",
			totalCases: 5,
			timestamp: new Date().toISOString(),
		});
		handler({
			type: "run:completed",
			runId: "run-cleanup",
			totalCases: 5,
			failedCases: 0,
			avgScore: 1,
			totalCost: 0,
			timestamp: new Date().toISOString(),
		});

		expect(repo.findAfterCursor("run-cleanup", 0)).toHaveLength(2);

		persister.cleanup("run-cleanup");
		expect(repo.findAfterCursor("run-cleanup", 0)).toHaveLength(0);
	});
});
