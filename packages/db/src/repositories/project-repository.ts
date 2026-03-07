import type { Project } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
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

	async findAll(): Promise<Project[]> {
		const rows = this.db.select().from(projects).all();
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

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(projects).where(eq(projects.id, id)).run();
		return result.changes > 0;
	}
}
