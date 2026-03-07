import type { CostRecord } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { costRecords } from "../schema/index.js";

export class CostRecordRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: Omit<CostRecord, "id" | "createdAt">): Promise<CostRecord> {
		const now = new Date().toISOString();
		const record = {
			id: nanoid(),
			...data,
			createdAt: now,
		};

		this.db.insert(costRecords).values(record).run();

		return record;
	}

	async findByRunId(runId: string): Promise<CostRecord[]> {
		return this.db.select().from(costRecords).where(eq(costRecords.runId, runId)).all();
	}
}
