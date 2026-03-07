export type { TokenUsage } from "./provider.js";

export interface CostEstimate {
	inputCost: number;
	outputCost: number;
	totalCost: number;
	currency: string;
}

export interface CostRecord {
	id: string;
	runId: string;
	providerId: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	inputCost: number;
	outputCost: number;
	totalCost: number;
	createdAt: string;
}

export interface ModelPricing {
	model: string;
	provider: string;
	inputPricePerMillion: number;
	outputPricePerMillion: number;
}
