import type { ScoreResult } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { scores } from "../schema/index.js";

export class ScoreRepository {
	constructor(private db: LLMBenchDB) {}

	async create(resultId: string, scoreResult: ScoreResult): Promise<ScoreResult & { id: string }> {
		const record = {
			id: nanoid(),
			resultId,
			scorerId: scoreResult.scorerId,
			scorerName: scoreResult.scorerName,
			scorerType: scoreResult.scorerType,
			value: scoreResult.value,
			rawValue: scoreResult.rawValue ?? null,
			reason: scoreResult.reason ?? null,
			metadata: scoreResult.metadata ? JSON.stringify(scoreResult.metadata) : null,
		};

		this.db.insert(scores).values(record).run();

		return { id: record.id, ...scoreResult };
	}

	async createMany(resultId: string, scoreResults: ScoreResult[]): Promise<void> {
		for (const sr of scoreResults) {
			await this.create(resultId, sr);
		}
	}

	async findByResultId(resultId: string): Promise<ScoreResult[]> {
		const rows = this.db.select().from(scores).where(eq(scores.resultId, resultId)).all();
		return rows.map(this.toScoreResult);
	}

	private toScoreResult(row: typeof scores.$inferSelect): ScoreResult {
		return {
			scorerId: row.scorerId,
			scorerName: row.scorerName,
			scorerType: row.scorerType as ScoreResult["scorerType"],
			value: row.value,
			rawValue: row.rawValue ?? undefined,
			reason: row.reason ?? undefined,
			metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
		};
	}
}
