import type { EvalRun, EvalRunConfig, EvalStatus } from "@llmbench/types";
import { desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { evalRuns } from "../schema/index.js";

export class EvalRunRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: {
		projectId: string;
		datasetId: string;
		config: EvalRunConfig;
		totalCases: number;
		tags?: string[];
	}): Promise<EvalRun> {
		const now = new Date().toISOString();
		const record = {
			id: nanoid(),
			projectId: data.projectId,
			datasetId: data.datasetId,
			status: "pending" as const,
			config: JSON.stringify(data.config),
			totalCases: data.totalCases,
			completedCases: 0,
			failedCases: 0,
			tags: data.tags ? JSON.stringify(data.tags) : null,
			createdAt: now,
			updatedAt: now,
		};

		this.db.insert(evalRuns).values(record).run();

		return this.toEvalRun({
			...record,
			totalCost: null,
			totalTokens: null,
			avgLatencyMs: null,
			completedAt: null,
		});
	}

	async findById(id: string): Promise<EvalRun | null> {
		const row = this.db.select().from(evalRuns).where(eq(evalRuns.id, id)).get();
		if (!row) return null;
		return this.toEvalRun(row);
	}

	async findByProjectId(projectId: string, limit = 50): Promise<EvalRun[]> {
		const rows = this.db
			.select()
			.from(evalRuns)
			.where(eq(evalRuns.projectId, projectId))
			.orderBy(desc(evalRuns.createdAt))
			.limit(limit)
			.all();
		return rows.map(this.toEvalRun);
	}

	async updateStatus(id: string, status: EvalStatus): Promise<void> {
		const now = new Date().toISOString();
		const updates: Record<string, unknown> = { status, updatedAt: now };
		if (status === "completed" || status === "failed") {
			updates.completedAt = now;
		}
		this.db.update(evalRuns).set(updates).where(eq(evalRuns.id, id)).run();
	}

	async updateProgress(
		id: string,
		data: {
			completedCases?: number;
			failedCases?: number;
			totalCost?: number;
			totalTokens?: number;
			avgLatencyMs?: number;
		},
	): Promise<void> {
		const now = new Date().toISOString();
		this.db
			.update(evalRuns)
			.set({ ...data, updatedAt: now })
			.where(eq(evalRuns.id, id))
			.run();
	}

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(evalRuns).where(eq(evalRuns.id, id)).run();
		return result.changes > 0;
	}

	private toEvalRun(row: typeof evalRuns.$inferSelect): EvalRun {
		return {
			id: row.id,
			projectId: row.projectId,
			datasetId: row.datasetId,
			status: row.status as EvalStatus,
			config: row.config ? JSON.parse(row.config) : {},
			totalCases: row.totalCases,
			completedCases: row.completedCases,
			failedCases: row.failedCases,
			totalCost: row.totalCost ?? undefined,
			totalTokens: row.totalTokens ?? undefined,
			avgLatencyMs: row.avgLatencyMs ?? undefined,
			tags: row.tags ? JSON.parse(row.tags) : undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
			completedAt: row.completedAt ?? undefined,
		};
	}
}
