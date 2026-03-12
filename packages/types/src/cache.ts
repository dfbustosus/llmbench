export interface CacheConfig {
	/** Enable or disable caching. Defaults to true when not specified. */
	enabled?: boolean;
	/** Cache entry lifetime in hours. Entries never expire when not specified. */
	ttlHours?: number;
}

export interface CacheEntry {
	id: string;
	cacheKey: string;
	model: string;
	input: string;
	output: string;
	tokenUsage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
	latencyMs?: number;
	createdAt: string;
	expiresAt?: string;
	hits: number;
}
