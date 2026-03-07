export interface ProviderConfig {
	type: ProviderType;
	name: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stopSequences?: string[];
	timeoutMs?: number;
	extra?: Record<string, unknown>;
}

export type ProviderType = "openai" | "anthropic" | "google" | "ollama" | "custom";

export interface ProviderResponse {
	output: string;
	latencyMs: number;
	tokenUsage: TokenUsage;
	rawResponse?: unknown;
	error?: string;
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
}

export interface IProvider {
	readonly type: ProviderType;
	readonly name: string;
	readonly model: string;

	generate(input: string, config?: Partial<ProviderConfig>): Promise<ProviderResponse>;
}
