export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}

export interface ResponseFormatJsonObject {
	type: "json_object";
}

export type ResponseFormat = ResponseFormatJsonObject;

export interface ToolFunction {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
}

export interface ToolDefinition {
	type: "function";
	function: ToolFunction;
}

export interface ToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export type ToolChoice =
	| "auto"
	| "required"
	| "none"
	| { type: "function"; function: { name: string } };

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
	tools?: ToolDefinition[];
	toolChoice?: ToolChoice;
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
	toolCalls?: ToolCall[];
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
	readonly tools?: ToolDefinition[];
	readonly toolChoice?: ToolChoice;

	generate(
		input: string | ChatMessage[],
		config?: Partial<ProviderConfig>,
	): Promise<ProviderResponse>;
}
