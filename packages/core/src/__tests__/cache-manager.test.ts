import { beforeEach, describe, expect, it, vi } from "vitest";
import { CacheManager } from "../engine/cache-manager.js";

// Mock CacheRepository
function createMockRepo() {
	const store = new Map<
		string,
		{
			id: string;
			cacheKey: string;
			model: string;
			input: string;
			output: string;
			tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
			latencyMs?: number;
			createdAt: string;
			expiresAt?: string;
			hits: number;
		}
	>();

	return {
		findByKey: vi.fn(async (key: string) => store.get(key) ?? null),
		create: vi.fn(
			async (data: {
				cacheKey: string;
				model: string;
				input: string;
				output: string;
				tokenUsage?: { inputTokens: number; outputTokens: number; totalTokens: number };
				latencyMs?: number;
				expiresAt?: string;
			}) => {
				if (store.has(data.cacheKey)) {
					throw new Error("UNIQUE constraint failed: cache_entries.cache_key");
				}
				const entry = {
					id: `id-${store.size + 1}`,
					cacheKey: data.cacheKey,
					model: data.model,
					input: data.input,
					output: data.output,
					tokenUsage: data.tokenUsage,
					latencyMs: data.latencyMs,
					createdAt: new Date().toISOString(),
					expiresAt: data.expiresAt,
					hits: 0,
				};
				store.set(data.cacheKey, entry);
				return entry;
			},
		),
		incrementHits: vi.fn(async (id: string) => {
			for (const entry of store.values()) {
				if (entry.id === id) {
					entry.hits++;
					break;
				}
			}
		}),
		deleteExpired: vi.fn(async () => 0),
		deleteAll: vi.fn(async () => {
			const size = store.size;
			store.clear();
			return size;
		}),
		count: vi.fn(async () => store.size),
		_store: store,
	};
}

describe("CacheManager", () => {
	let repo: ReturnType<typeof createMockRepo>;
	let cache: CacheManager;

	beforeEach(() => {
		repo = createMockRepo();
		cache = new CacheManager(repo as never);
	});

	describe("computeKey", () => {
		it("should produce deterministic keys for same inputs", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello", { temperature: 0.7 });
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", { temperature: 0.7 });
			expect(key1).toBe(key2);
		});

		it("should produce different keys for different models", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello");
			const key2 = cache.computeKey("p1", "gpt-3.5", "Hello");
			expect(key1).not.toBe(key2);
		});

		it("should produce different keys for different inputs", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello");
			const key2 = cache.computeKey("p1", "gpt-4", "Goodbye");
			expect(key1).not.toBe(key2);
		});

		it("should produce different keys for different config params", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello", { temperature: 0.7 });
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", { temperature: 0.9 });
			expect(key1).not.toBe(key2);
		});

		it("should produce different keys for different provider IDs", () => {
			const key1 = cache.computeKey("provider-a", "gpt-4", "Hello");
			const key2 = cache.computeKey("provider-b", "gpt-4", "Hello");
			expect(key1).not.toBe(key2);
		});

		it("should ignore environmental params like apiKey and baseUrl", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello", {
				temperature: 0.7,
				apiKey: "key-1",
				baseUrl: "http://localhost:1",
				timeoutMs: 5000,
			} as never);
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", {
				temperature: 0.7,
				apiKey: "key-2",
				baseUrl: "http://localhost:2",
				timeoutMs: 10000,
			} as never);
			expect(key1).toBe(key2);
		});

		it("should produce a 64-char hex string (SHA-256)", () => {
			const key = cache.computeKey("p1", "gpt-4", "Hello");
			expect(key).toMatch(/^[0-9a-f]{64}$/);
		});

		it("should handle ChatMessage[] input", () => {
			const messages = [
				{ role: "user" as const, content: "Hello" },
				{ role: "assistant" as const, content: "Hi" },
			];
			const key1 = cache.computeKey("p1", "gpt-4", messages);
			const key2 = cache.computeKey("p1", "gpt-4", messages);
			expect(key1).toBe(key2);

			const key3 = cache.computeKey("p1", "gpt-4", "Hello");
			expect(key1).not.toBe(key3);
		});

		it("should produce same key with undefined config and no config", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello");
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", undefined);
			expect(key1).toBe(key2);
		});

		it("should produce different keys when responseFormat differs", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello", { temperature: 0.7 });
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", {
				temperature: 0.7,
				responseFormat: { type: "json_object" },
			});
			expect(key1).not.toBe(key2);
		});

		it("should produce same key for same responseFormat", () => {
			const key1 = cache.computeKey("p1", "gpt-4", "Hello", {
				responseFormat: { type: "json_object" },
			});
			const key2 = cache.computeKey("p1", "gpt-4", "Hello", {
				responseFormat: { type: "json_object" },
			});
			expect(key1).toBe(key2);
		});
	});

	describe("get/set", () => {
		it("should return null on cache miss", async () => {
			const result = await cache.get("p1", "gpt-4", "Hello");
			expect(result).toBeNull();
		});

		it("should return cached response on cache hit", async () => {
			const response = {
				output: "Hi there!",
				latencyMs: 200,
				tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
			};

			await cache.set("p1", "gpt-4", "Hello", undefined, response);
			const result = await cache.get("p1", "gpt-4", "Hello");

			expect(result).not.toBeNull();
			expect(result?.output).toBe("Hi there!");
			expect(result?.latencyMs).toBe(0);
			expect(result?.tokenUsage).toEqual({ inputTokens: 5, outputTokens: 3, totalTokens: 8 });
		});

		it("should increment hits on cache hit", async () => {
			const response = {
				output: "Hi",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};

			await cache.set("p1", "gpt-4", "Hello", undefined, response);
			await cache.get("p1", "gpt-4", "Hello");
			await cache.get("p1", "gpt-4", "Hello");

			expect(repo.incrementHits).toHaveBeenCalledTimes(2);
		});

		it("should not increment hits on cache miss", async () => {
			await cache.get("p1", "gpt-4", "Hello");
			expect(repo.incrementHits).not.toHaveBeenCalled();
		});

		it("should return null for expired entries", async () => {
			const key = cache.computeKey("p1", "gpt-4", "Hello");
			const pastDate = new Date(Date.now() - 1000).toISOString();
			repo._store.set(key, {
				id: "expired-1",
				cacheKey: key,
				model: "gpt-4",
				input: "Hello",
				output: "Hi",
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				latencyMs: 100,
				createdAt: new Date().toISOString(),
				expiresAt: pastDate,
				hits: 0,
			});

			const result = await cache.get("p1", "gpt-4", "Hello");
			expect(result).toBeNull();
			expect(repo.incrementHits).not.toHaveBeenCalled();
		});

		it("should return entry when expiresAt is not set (no TTL)", async () => {
			const key = cache.computeKey("p1", "gpt-4", "Hello");
			repo._store.set(key, {
				id: "no-ttl",
				cacheKey: key,
				model: "gpt-4",
				input: "Hello",
				output: "Hi",
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				latencyMs: 100,
				createdAt: new Date().toISOString(),
				expiresAt: undefined,
				hits: 0,
			});

			const result = await cache.get("p1", "gpt-4", "Hello");
			expect(result).not.toBeNull();
			expect(result?.output).toBe("Hi");
		});

		it("should not throw on duplicate key insertion (concurrent safety)", async () => {
			const response = {
				output: "Hi",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};

			await cache.set("p1", "gpt-4", "Hello", undefined, response);
			// Second set with same key should not throw
			await expect(cache.set("p1", "gpt-4", "Hello", undefined, response)).resolves.toBeUndefined();
		});

		it("should not return cached response for different provider IDs", async () => {
			const response = {
				output: "Hi",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};

			await cache.set("provider-a", "gpt-4", "Hello", undefined, response);
			const result = await cache.get("provider-b", "gpt-4", "Hello");
			expect(result).toBeNull();
		});
	});

	describe("TTL", () => {
		it("should set expiresAt when ttlHours is configured", async () => {
			const cacheWithTtl = new CacheManager(repo as never, { ttlHours: 24 });
			const response = {
				output: "Hi",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};

			await cacheWithTtl.set("p1", "gpt-4", "Hello", undefined, response);

			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					expiresAt: expect.any(String),
				}),
			);

			const createCall = repo.create.mock.calls[0][0];
			const expiresAt = new Date(createCall.expiresAt as string);
			const now = new Date();
			const diffHours = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60);
			expect(diffHours).toBeGreaterThan(23);
			expect(diffHours).toBeLessThanOrEqual(24);
		});

		it("should not set expiresAt when ttlHours is not configured", async () => {
			const response = {
				output: "Hi",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};

			await cache.set("p1", "gpt-4", "Hello", undefined, response);

			expect(repo.create).toHaveBeenCalledWith(
				expect.objectContaining({
					expiresAt: undefined,
				}),
			);
		});
	});
});
