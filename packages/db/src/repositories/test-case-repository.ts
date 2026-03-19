import type { ChatMessage, TestCase, TestCaseAssertion } from "@llmbench/types";
import { asc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { testCases } from "../schema/index.js";

export class TestCaseRepository {
	constructor(private db: LLMBenchDB) {}

	async create(data: {
		datasetId: string;
		input: string;
		expected: string;
		messages?: ChatMessage[];
		context?: Record<string, unknown>;
		tags?: string[];
		assert?: TestCaseAssertion[];
		orderIndex?: number;
	}): Promise<TestCase> {
		const testCase = {
			id: nanoid(),
			datasetId: data.datasetId,
			input: data.input,
			expected: data.expected,
			messages: data.messages ? JSON.stringify(data.messages) : null,
			context: data.context ? JSON.stringify(data.context) : null,
			tags: data.tags ? JSON.stringify(data.tags) : null,
			assert: data.assert ? JSON.stringify(data.assert) : null,
			orderIndex: data.orderIndex ?? 0,
		};

		this.db.insert(testCases).values(testCase).run();

		return {
			id: testCase.id,
			datasetId: testCase.datasetId,
			input: testCase.input,
			expected: testCase.expected,
			messages: data.messages,
			context: data.context,
			tags: data.tags,
			assert: data.assert,
			orderIndex: testCase.orderIndex,
		};
	}

	async createMany(
		items: Array<{
			datasetId: string;
			input: string;
			expected: string;
			messages?: ChatMessage[];
			context?: Record<string, unknown>;
			tags?: string[];
			assert?: TestCaseAssertion[];
			orderIndex?: number;
		}>,
	): Promise<TestCase[]> {
		if (items.length === 0) return [];

		const records = items.map((item, i) => ({
			id: nanoid(),
			datasetId: item.datasetId,
			input: item.input,
			expected: item.expected,
			messages: item.messages ? JSON.stringify(item.messages) : null,
			context: item.context ? JSON.stringify(item.context) : null,
			tags: item.tags ? JSON.stringify(item.tags) : null,
			assert: item.assert ? JSON.stringify(item.assert) : null,
			orderIndex: item.orderIndex ?? i,
		}));

		// SQLite has a ~32766 bind variable limit. With 10 columns per row,
		// insert in chunks of 500 to stay well under the limit.
		const CHUNK_SIZE = 500;
		for (let i = 0; i < records.length; i += CHUNK_SIZE) {
			this.db
				.insert(testCases)
				.values(records.slice(i, i + CHUNK_SIZE))
				.run();
		}

		return records.map((r, i) => ({
			id: r.id,
			datasetId: r.datasetId,
			input: r.input,
			expected: r.expected,
			messages: items[i].messages,
			context: items[i].context,
			tags: items[i].tags,
			assert: items[i].assert,
			orderIndex: r.orderIndex,
		}));
	}

	async findByDatasetId(
		datasetId: string,
		options?: { limit?: number; offset?: number },
	): Promise<TestCase[]> {
		const rows = this.db
			.select()
			.from(testCases)
			.where(eq(testCases.datasetId, datasetId))
			.orderBy(asc(testCases.orderIndex))
			.limit(options?.limit ?? 10000)
			.offset(options?.offset ?? 0)
			.all();
		return rows.map(this.toTestCase);
	}

	async findById(id: string): Promise<TestCase | null> {
		const row = this.db.select().from(testCases).where(eq(testCases.id, id)).get();
		if (!row) return null;
		return this.toTestCase(row);
	}

	async delete(id: string): Promise<boolean> {
		const result = this.db.delete(testCases).where(eq(testCases.id, id)).run();
		return result.changes > 0;
	}

	async deleteByDatasetId(datasetId: string): Promise<number> {
		const result = this.db.delete(testCases).where(eq(testCases.datasetId, datasetId)).run();
		return result.changes;
	}

	private toTestCase(row: typeof testCases.$inferSelect): TestCase {
		return {
			id: row.id,
			datasetId: row.datasetId,
			input: row.input,
			expected: row.expected,
			messages: row.messages ? JSON.parse(row.messages) : undefined,
			context: row.context ? JSON.parse(row.context) : undefined,
			tags: row.tags ? JSON.parse(row.tags) : undefined,
			assert: row.assert ? JSON.parse(row.assert) : undefined,
			orderIndex: row.orderIndex,
		};
	}
}
