import type { Project } from "@llmbench/types";
import { count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { DEFAULT_LIMITS } from "../constants.js";
import { projects } from "../schema/index.js";

export class ProjectRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: { name: string; description?: string }): Promise<Project> {
		const now = new Date().toISOString();
		const project = {
			id: nanoid(),
			name: data.name,
			description: data.description ?? null,
			createdAt: now,
			updatedAt: now,
		};

		this.db.insert(projects).values(project).run();

		return {
			id: project.id,
			name: project.name,
			description: project.description ?? undefined,
			createdAt: project.createdAt,
			updatedAt: project.updatedAt,
		};
	}

	async findById(id: string): Promise<Project | null> {
		const row = this.db.select().from(projects).where(eq(projects.id, id)).get();
		if (!row) return null;
		return {
			...row,
			description: row.description ?? undefined,
		};
	}

	async findAll(options?: { limit?: number; offset?: number }): Promise<Project[]> {
		const rows = this.db
			.select()
			.from(projects)
			.limit(options?.limit ?? DEFAULT_LIMITS.BROWSE)
			.offset(options?.offset ?? 0)
			.all();
		return rows.map((row) => ({
			...row,
			description: row.description ?? undefined,
		}));
	}

	async update(id: string, data: { name?: string; description?: string }): Promise<Project | null> {
		const now = new Date().toISOString();
		this.db
			.update(projects)
			.set({ ...data, updatedAt: now })
			.where(eq(projects.id, id))
			.run();

		return this.findById(id);
	}

	async countAll(): Promise<number> {
		const row = this.db.select({ count: count() }).from(projects).get();
		return row?.count ?? 0;
	}

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(projects).where(eq(projects.id, id)).run();
		return result.changes > 0;
	}
}
