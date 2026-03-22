export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ResponseFormatJsonObject {
	type: "json_object";
}

export type ResponseFormat = ResponseFormatJsonObject;

export interface ProviderConfig {
	type: ProviderType;
	name: string;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	systemMessage?: string;
	temperature?: number;
	maxTokens?: number;
	topP?: number;
	frequencyPenalty?: number;
	presencePenalty?: number;
	stopSequences?: string[];
	responseFormat?: ResponseFormat;
	timeoutMs?: number;
	extra?: Record<string, unknown>;
}

export type ProviderType =
	| "openai"
	| "azure-openai"
	| "anthropic"
	| "google"
	| "mistral"
	| "together"
	| "bedrock"
	| "ollama"
	| "custom";

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
	readonly systemMessage?: string;
	readonly responseFormat?: ResponseFormat;

	generate(
		input: string | ChatMessage[],
		config?: Partial<ProviderConfig>,
	): Promise<ProviderResponse>;
}
