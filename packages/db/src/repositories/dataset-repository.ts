import type { Dataset } from "@llmbench/types";
import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { DEFAULT_LIMITS } from "../constants.js";
import { datasets } from "../schema/index.js";

export class DatasetRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: {
		projectId: string;
		name: string;
		description?: string;
		contentHash?: string;
		version?: number;
	}): Promise<Dataset> {
		const now = new Date().toISOString();
		const dataset = {
			id: nanoid(),
			projectId: data.projectId,
			name: data.name,
			description: data.description ?? null,
			version: data.version ?? 1,
			contentHash: data.contentHash ?? null,
			createdAt: now,
			updatedAt: now,
		};

		this.db.insert(datasets).values(dataset).run();

		return {
			...dataset,
			description: dataset.description ?? undefined,
			contentHash: dataset.contentHash ?? undefined,
		};
	}

	async findById(id: string): Promise<Dataset | null> {
		const row = this.db.select().from(datasets).where(eq(datasets.id, id)).get();
		if (!row) return null;
		return this.toDataset(row);
	}

	async findByProjectId(
		projectId: string,
		options?: { limit?: number; offset?: number },
	): Promise<Dataset[]> {
		const rows = this.db
			.select()
			.from(datasets)
			.where(eq(datasets.projectId, projectId))
			.limit(options?.limit ?? DEFAULT_LIMITS.BROWSE)
			.offset(options?.offset ?? 0)
			.all();
		return rows.map(this.toDataset);
	}

	async findByNameInProject(projectId: string, name: string): Promise<Dataset[]> {
		const rows = this.db
			.select()
			.from(datasets)
			.where(and(eq(datasets.projectId, projectId), eq(datasets.name, name)))
			.orderBy(desc(datasets.version))
			.all();
		return rows.map(this.toDataset);
	}

	async update(
		id: string,
		data: { name?: string; description?: string; version?: number; contentHash?: string },
	): Promise<Dataset | null> {
		const now = new Date().toISOString();
		this.db
			.update(datasets)
			.set({ ...data, updatedAt: now })
			.where(eq(datasets.id, id))
			.run();
		return this.findById(id);
	}

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(datasets).where(eq(datasets.id, id)).run();
		return result.changes > 0;
	}

	private toDataset(row: typeof datasets.$inferSelect): Dataset {
		return {
			...row,
			description: row.description ?? undefined,
			contentHash: row.contentHash ?? undefined,
		};
	}
}
