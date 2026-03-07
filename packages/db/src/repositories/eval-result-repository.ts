import type { EvalResult } from "@llmbench/types";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { evalResults } from "../schema/index.js";

export class EvalResultRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: {
		runId: string;
		testCaseId: string;
		providerId: string;
		input: string;
		output: string;
		expected: string;
		error?: string;
		latencyMs: number;
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
		cost?: number;
		rawResponse?: unknown;
	}): Promise<EvalResult> {
		const now = new Date().toISOString();
		const record = {
			id: nanoid(),
			runId: data.runId,
			testCaseId: data.testCaseId,
			providerId: data.providerId,
			input: data.input,
			output: data.output,
			expected: data.expected,
			error: data.error ?? null,
			latencyMs: data.latencyMs,
			inputTokens: data.inputTokens,
			outputTokens: data.outputTokens,
			totalTokens: data.totalTokens,
			cost: data.cost ?? null,
			rawResponse: data.rawResponse ? JSON.stringify(data.rawResponse) : null,
			createdAt: now,
		};

		this.db.insert(evalResults).values(record).run();

		return {
			id: record.id,
			runId: record.runId,
			testCaseId: record.testCaseId,
			providerId: record.providerId,
			input: record.input,
			output: record.output,
			expected: record.expected,
			error: record.error ?? undefined,
			latencyMs: record.latencyMs,
			tokenUsage: {
				inputTokens: record.inputTokens,
				outputTokens: record.outputTokens,
				totalTokens: record.totalTokens,
			},
			cost: record.cost ?? undefined,
			rawResponse: data.rawResponse,
			createdAt: record.createdAt,
		};
	}

	async findByRunId(runId: string): Promise<EvalResult[]> {
		const rows = this.db.select().from(evalResults).where(eq(evalResults.runId, runId)).all();
		return rows.map(this.toEvalResult);
	}

	async findById(id: string): Promise<EvalResult | null> {
		const row = this.db.select().from(evalResults).where(eq(evalResults.id, id)).get();
		if (!row) return null;
		return this.toEvalResult(row);
	}

	private toEvalResult(row: typeof evalResults.$inferSelect): EvalResult {
		return {
			id: row.id,
			runId: row.runId,
			testCaseId: row.testCaseId,
			providerId: row.providerId,
			input: row.input,
			output: row.output,
			expected: row.expected,
			error: row.error ?? undefined,
			latencyMs: row.latencyMs,
			tokenUsage: {
				inputTokens: row.inputTokens,
				outputTokens: row.outputTokens,
				totalTokens: row.totalTokens,
			},
			cost: row.cost ?? undefined,
			rawResponse: row.rawResponse ? JSON.parse(row.rawResponse) : undefined,
			createdAt: row.createdAt,
		};
	}
}
