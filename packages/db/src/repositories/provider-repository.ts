import type { ProviderConfig, ProviderType } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { providers } from "../schema/index.js";

export interface ProviderRecord {
	id: string;
	projectId: string;
	type: ProviderType;
	name: string;
	model: string;
	config?: Partial<ProviderConfig>;
	createdAt: string;
	updatedAt: string;
}

export class ProviderRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: {
		projectId: string;
		type: ProviderType;
		name: string;
		model: string;
		config?: Partial<ProviderConfig>;
	}): Promise<ProviderRecord> {
		const now = new Date().toISOString();
		const record = {
			id: nanoid(),
			projectId: data.projectId,
			type: data.type,
			name: data.name,
			model: data.model,
			config: data.config ? JSON.stringify(data.config) : null,
			createdAt: now,
			updatedAt: now,
		};

		this.db.insert(providers).values(record).run();

		return {
			id: record.id,
			projectId: record.projectId,
			type: record.type as ProviderType,
			name: record.name,
			model: record.model,
			config: data.config,
			createdAt: record.createdAt,
			updatedAt: record.updatedAt,
		};
	}

	async findById(id: string): Promise<ProviderRecord | null> {
		const row = this.db.select().from(providers).where(eq(providers.id, id)).get();
		if (!row) return null;
		return this.toRecord(row);
	}

	async findByProjectId(projectId: string): Promise<ProviderRecord[]> {
		const rows = this.db.select().from(providers).where(eq(providers.projectId, projectId)).all();
		return rows.map(this.toRecord);
	}

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(providers).where(eq(providers.id, id)).run();
		return result.changes > 0;
	}

	private toRecord(row: typeof providers.$inferSelect): ProviderRecord {
		return {
			id: row.id,
			projectId: row.projectId,
			type: row.type as ProviderType,
			name: row.name,
			model: row.model,
			config: row.config ? JSON.parse(row.config) : undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		};
	}
}
