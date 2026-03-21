import type { ProviderConfig, ProviderType } from "@llmbench/types";
import { and, eq } from "drizzle-orm";
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

	async findByProjectAndName(projectId: string, name: string): Promise<ProviderRecord | null> {
		const row = this.db
			.select()
			.from(providers)
			.where(and(eq(providers.projectId, projectId), eq(providers.name, name)))
			.get();
		if (!row) return null;
		return this.toRecord(row);
	}

	async update(
		id: string,
		data: { type?: ProviderType; name?: string; model?: string; config?: Partial<ProviderConfig> },
	): Promise<ProviderRecord | null> {
		const now = new Date().toISOString();
		const updates: Record<string, unknown> = { updatedAt: now };
		if (data.type !== undefined) updates.type = data.type;
		if (data.name !== undefined) updates.name = data.name;
		if (data.model !== undefined) updates.model = data.model;
		if (data.config !== undefined) updates.config = JSON.stringify(data.config);
		this.db.update(providers).set(updates).where(eq(providers.id, id)).run();
		return this.findById(id);
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
