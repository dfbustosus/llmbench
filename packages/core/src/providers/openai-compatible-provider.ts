import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	ProviderType,
	ToolCall,
} from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

/** HTTP status codes that are worth retrying */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Base class for providers with OpenAI-compatible chat/completions APIs.
 * Subclasses only need to configure type, API key env var, base URL, headers,
 * and optionally override how max_tokens is serialised in the request body.
 */
export abstract class OpenAICompatibleProvider extends BaseProvider {
	protected apiKey: string;
	protected baseUrl: string;

	constructor(
		config: ProviderConfig,
		providerType: ProviderType,
		envVar: string,
		defaultBaseUrl: string,
	) {
		super({ ...config, type: providerType });
		this.apiKey = this.resolveApiKey(config.apiKey, envVar);
		this.baseUrl = config.baseUrl || defaultBaseUrl;
	}

	/** Provider name used in error messages (e.g. "OpenAI", "Mistral"). */
	protected get providerLabel(): string {
		return this.type.charAt(0).toUpperCase() + this.type.slice(1);
	}

	/** Build request headers. Override for providers with non-Bearer auth. */
	protected buildHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.apiKey}`,
		};
	}

	/** Build the full endpoint URL. Override for providers with custom routing. */
	protected buildEndpointUrl(): string {
		return `${this.baseUrl}/chat/completions`;
	}

	/** Serialise max tokens into the request body. OpenAI uses max_completion_tokens. */
	protected setMaxTokens(body: Record<string, unknown>, maxTokens: number): void {
		body.max_completion_tokens = maxTokens;
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const messages = this.buildMessages(input, overrides);

			const body: Record<string, unknown> = {
				model: cfg.model,
				messages,
				temperature: cfg.temperature ?? 0,
			};

			if (cfg.maxTokens != null) this.setMaxTokens(body, cfg.maxTokens);
			if (cfg.topP != null) body.top_p = cfg.topP;
			if (cfg.frequencyPenalty != null) body.frequency_penalty = cfg.frequencyPenalty;
			if (cfg.presencePenalty != null) body.presence_penalty = cfg.presencePenalty;
			if (cfg.stopSequences != null) body.stop = cfg.stopSequences;
			if (cfg.responseFormat) body.response_format = { type: cfg.responseFormat.type };
			if (cfg.tools?.length) body.tools = cfg.tools;
			if (cfg.toolChoice != null) body.tool_choice = cfg.toolChoice;

			const response = await fetch(this.buildEndpointUrl(), {
				method: "POST",
				headers: this.buildHeaders(),
				body: JSON.stringify(body),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			const data = (await response.json()) as Record<string, unknown>;
			const latencyMs = Date.now() - startTime;

			if (!response.ok) {
				const err = data.error as Record<string, unknown> | undefined;
				const errorMsg =
					(err?.message as string) || JSON.stringify(data) || `HTTP ${response.status}`;

				if (RETRYABLE_STATUS_CODES.has(response.status)) {
					throw new Error(`${this.providerLabel} API error (${response.status}): ${errorMsg}`);
				}

				return {
					output: "",
					latencyMs,
					tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					error: `${this.providerLabel} API error (${response.status}): ${errorMsg}`,
				};
			}

			const choices = data.choices as Array<Record<string, unknown>> | undefined;
			const message = choices?.[0]?.message as Record<string, unknown> | undefined;
			const textContent = (message?.content as string) ?? "";
			const usage = (data.usage ?? {}) as Record<string, number>;

			// Extract tool calls if present
			const rawToolCalls = message?.tool_calls as
				| Array<{ id: string; type: string; function: { name: string; arguments: string } }>
				| undefined;
			let toolCalls: ToolCall[] | undefined;
			if (rawToolCalls?.length) {
				toolCalls = rawToolCalls.map((tc) => ({
					id: tc.id,
					type: "function" as const,
					function: { name: tc.function.name, arguments: tc.function.arguments },
				}));
			}

			const output = textContent || (toolCalls ? JSON.stringify(toolCalls) : "");

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.prompt_tokens ?? 0,
					outputTokens: usage.completion_tokens ?? 0,
					totalTokens: usage.total_tokens ?? 0,
				},
				toolCalls,
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			if (error instanceof Error && error.message.startsWith(`${this.providerLabel} API error`)) {
				throw error;
			}
			return {
				output: "",
				latencyMs,
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
