import type { ProviderConfig } from "./provider.js";
import type { ScorerConfig } from "./scoring.js";

export interface LLMBenchConfig {
	projectName: string;
	description?: string;
	dbPath?: string;
	port?: number;

	providers: ProviderConfig[];
	scorers: ScorerConfig[];

	defaults?: {
		concurrency?: number;
		maxRetries?: number;
		timeoutMs?: number;
	};
}
