import { and, asc, eq, gt, inArray, notInArray } from "drizzle-orm";
import type { LLMBenchDB } from "../client.js";
import { evalEvents, evalRuns } from "../schema/index.js";

export interface EvalEventRow {
	seq: number;
	runId: string;
	eventType: string;
	payload: string;
	timestamp: string;
}

export class EventRepository {
	constructor(private db: LLMBenchDB) {}

	insert(data: { runId: string; eventType: string; payload: string; timestamp: string }): {
		seq: number;
	} {
		const result = this.db
			.insert(evalEvents)
			.values({
				runId: data.runId,
				eventType: data.eventType,
				payload: data.payload,
				timestamp: data.timestamp,
			})
			.run();
		return { seq: Number(result.lastInsertRowid) };
	}

	findAfterCursor(runId: string, afterSeq: number, limit = 100): EvalEventRow[] {
		return this.db
			.select()
			.from(evalEvents)
			.where(and(eq(evalEvents.runId, runId), gt(evalEvents.seq, afterSeq)))
			.orderBy(asc(evalEvents.seq))
			.limit(limit)
			.all();
	}

	deleteByRunId(runId: string): number {
		const result = this.db.delete(evalEvents).where(eq(evalEvents.runId, runId)).run();
		return result.changes;
	}

	deleteStale(): number {
		// Delete events for runs that are no longer running or pending
		const activeRunIds = this.db
			.select({ id: evalRuns.id })
			.from(evalRuns)
			.where(inArray(evalRuns.status, ["running", "pending"]))
			.all()
			.map((r) => r.id);

		if (activeRunIds.length === 0) {
			// No active runs — delete all events
			const result = this.db.delete(evalEvents).run();
			return result.changes;
		}

		const result = this.db
			.delete(evalEvents)
			.where(notInArray(evalEvents.runId, activeRunIds))
			.run();
		return result.changes;
	}
}
