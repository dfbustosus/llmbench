import type { CacheEntry } from "@llmbench/types";
import { eq, lt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { LLMBenchDB } from "../client.js";
import { cacheEntries } from "../schema/index.js";

export class CacheRepository {
	constructor(private db: LLMBenchDB) {}

	async findByKey(cacheKey: string): Promise<CacheEntry | null> {
		const row = this.db
			.select()
			.from(cacheEntries)
			.where(eq(cacheEntries.cacheKey, cacheKey))
			.get();
		if (!row) return null;
		return this.toEntry(row);
	}

	async create(data: {
		cacheKey: string;
		model: string;
		input: string;
		output: string;
		tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
		latencyMs?: number;
		expiresAt?: string;
	}): Promise<CacheEntry> {
		const now = new Date().toISOString();
		const entry = {
			id: nanoid(),
			cacheKey: data.cacheKey,
			model: data.model,
			input: data.input,
			output: data.output,
			tokenUsage: data.tokenUsage ? JSON.stringify(data.tokenUsage) : null,
			latencyMs: data.latencyMs ?? null,
			createdAt: now,
			expiresAt: data.expiresAt ?? null,
			hits: 0,
		};

		this.db.insert(cacheEntries).values(entry).run();

		return this.toEntry(entry);
	}

	async incrementHits(id: string): Promise<void> {
		this.db
			.update(cacheEntries)
			.set({ hits: sql`${cacheEntries.hits} + 1` })
			.where(eq(cacheEntries.id, id))
			.run();
	}

	/** Deletes entries whose expiresAt is in the past. Entries with NULL expiresAt (no TTL) are preserved. */
	async deleteExpired(): Promise<number> {
		const now = new Date().toISOString();
		const result = this.db.delete(cacheEntries).where(lt(cacheEntries.expiresAt, now)).run();
		return result.changes;
	}

	async deleteAll(): Promise<number> {
		const result = this.db.delete(cacheEntries).run();
		return result.changes;
	}

	async count(): Promise<number> {
		const result = this.db.select({ count: sql<number>`count(*)` }).from(cacheEntries).get();
		return result?.count ?? 0;
	}

	private toEntry(row: {
		id: string;
		cacheKey: string;
		model: string;
		input: string;
		output: string;
		tokenUsage: string | null;
		latencyMs: number | null;
		createdAt: string;
		expiresAt: string | null;
		hits: number;
	}): CacheEntry {
		return {
			id: row.id,
			cacheKey: row.cacheKey,
			model: row.model,
			input: row.input,
			output: row.output,
			tokenUsage: row.tokenUsage ? JSON.parse(row.tokenUsage) : undefined,
			latencyMs: row.latencyMs ?? undefined,
			createdAt: row.createdAt,
			expiresAt: row.expiresAt ?? undefined,
			hits: row.hits,
		};
	}
}
