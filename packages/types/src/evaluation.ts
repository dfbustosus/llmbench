import type { ScorerConfig } from "./scoring.js";

export type EvalStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface EvalRun {
	id: string;
	projectId: string;
	datasetId: string;
	status: EvalStatus;
	config: EvalRunConfig;
	totalCases: number;
	completedCases: number;
	failedCases: number;
	totalCost?: number;
	totalTokens?: number;
	avgLatencyMs?: number;
	tags?: string[];
	createdAt: string;
	updatedAt: string;
	completedAt?: string;
}

export interface EvalRunConfig {
	providerIds: string[];
	scorerConfigs: ScorerConfig[];
	concurrency: number;
	maxRetries: number;
	timeoutMs: number;
}

export interface EvalResult {
	id: string;
	runId: string;
	testCaseId: string;
	providerId: string;
	input: string;
	output: string;
	expected: string;
	error?: string;
	latencyMs: number;
	tokenUsage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens: number;
	};
	cost?: number;
	rawResponse?: unknown;
	createdAt: string;
}
