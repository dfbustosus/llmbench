import type { Dataset } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { datasets } from "../schema/index.js";

export class DatasetRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: { projectId: string; name: string; description?: string }): Promise<Dataset> {
		const now = new Date().toISOString();
		const dataset = {
			id: nanoid(),
			projectId: data.projectId,
			name: data.name,
			description: data.description ?? null,
			version: 1,
			createdAt: now,
			updatedAt: now,
		};

		this.db.insert(datasets).values(dataset).run();

		return {
			...dataset,
			description: dataset.description ?? undefined,
		};
	}

	async findById(id: string): Promise<Dataset | null> {
		const row = this.db.select().from(datasets).where(eq(datasets.id, id)).get();
		if (!row) return null;
		return { ...row, description: row.description ?? undefined };
	}

	async findByProjectId(projectId: string): Promise<Dataset[]> {
		const rows = this.db.select().from(datasets).where(eq(datasets.projectId, projectId)).all();
		return rows.map((row) => ({ ...row, description: row.description ?? undefined }));
	}

	async update(
		id: string,
		data: { name?: string; description?: string; version?: number },
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
}
