import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	ProviderType,
	TokenUsage,
	ToolCall,
} from "@llmbench/types";
import { ErrorCode, ProviderError } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";
import { parseSSE } from "./streaming/sse-parser.js";

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

		// Delegate to streaming path when enabled (fall back for tool calls)
		if (cfg.stream === true && !cfg.tools?.length) {
			return this.generateStreaming(input, cfg, overrides);
		}

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

				{
					const code =
						response.status === 429 ? ErrorCode.PROVIDER_RATE_LIMIT : ErrorCode.PROVIDER_API_ERROR;
					throw new ProviderError(
						code,
						`${this.providerLabel} API error (${response.status}): ${errorMsg}`,
						{
							providerName: this.name,
							providerType: this.type,
							statusCode: response.status,
						},
					);
				}
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
			if (error instanceof ProviderError) {
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

	private async generateStreaming(
		input: string | ChatMessage[],
		cfg: ProviderConfig,
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const startTime = Date.now();
		let timeToFirstTokenMs: number | undefined;
		const chunks: string[] = [];
		let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

		try {
			const messages = this.buildMessages(input, overrides);

			const body: Record<string, unknown> = {
				model: cfg.model,
				messages,
				temperature: cfg.temperature ?? 0,
				stream: true,
				stream_options: { include_usage: true },
			};

			if (cfg.maxTokens != null) this.setMaxTokens(body, cfg.maxTokens);
			if (cfg.topP != null) body.top_p = cfg.topP;
			if (cfg.frequencyPenalty != null) body.frequency_penalty = cfg.frequencyPenalty;
			if (cfg.presencePenalty != null) body.presence_penalty = cfg.presencePenalty;
			if (cfg.stopSequences != null) body.stop = cfg.stopSequences;
			if (cfg.responseFormat) body.response_format = { type: cfg.responseFormat.type };

			const response = await fetch(this.buildEndpointUrl(), {
				method: "POST",
				headers: this.buildHeaders(),
				body: JSON.stringify(body),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			if (!response.ok) {
				const data = (await response.json()) as Record<string, unknown>;
				const err = data.error as Record<string, unknown> | undefined;
				const errorMsg =
					(err?.message as string) || JSON.stringify(data) || `HTTP ${response.status}`;

				{
					const code =
						response.status === 429 ? ErrorCode.PROVIDER_RATE_LIMIT : ErrorCode.PROVIDER_API_ERROR;
					throw new ProviderError(
						code,
						`${this.providerLabel} API error (${response.status}): ${errorMsg}`,
						{
							providerName: this.name,
							providerType: this.type,
							statusCode: response.status,
						},
					);
				}
			}

			if (!response.body) {
				throw new ProviderError(
					ErrorCode.PROVIDER_API_ERROR,
					`${this.providerLabel} streaming response has no body`,
					{ providerName: this.name, providerType: this.type },
				);
			}

			for await (const event of parseSSE(response.body)) {
				if (event.data === "[DONE]") break;

				const parsed = JSON.parse(event.data) as Record<string, unknown>;
				const choices = parsed.choices as Array<Record<string, unknown>> | undefined;
				const delta = choices?.[0]?.delta as Record<string, unknown> | undefined;
				const content = delta?.content as string | undefined;

				if (content) {
					if (timeToFirstTokenMs === undefined) {
						timeToFirstTokenMs = Date.now() - startTime;
					}
					chunks.push(content);
				}

				// Extract usage from the final chunk (when stream_options.include_usage is set)
				const usage = parsed.usage as Record<string, number> | undefined;
				if (usage) {
					tokenUsage = {
						inputTokens: usage.prompt_tokens ?? 0,
						outputTokens: usage.completion_tokens ?? 0,
						totalTokens: usage.total_tokens ?? 0,
					};
				}
			}

			return {
				output: chunks.join(""),
				latencyMs: Date.now() - startTime,
				timeToFirstTokenMs,
				tokenUsage,
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			if (error instanceof ProviderError) {
				throw error;
			}
			return {
				output: chunks.join(""),
				latencyMs,
				timeToFirstTokenMs,
				tokenUsage,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
