import type { CIGateConfig } from "./gate.js";
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

	/** CI gate thresholds. When configured, CLI commands exit 1 on violations. */
	gate?: CIGateConfig;
}
