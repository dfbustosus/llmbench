import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

/** HTTP status codes that are worth retrying */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

export class OpenAIProvider extends BaseProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "openai" });
		this.apiKey = this.resolveApiKey(config.apiKey, "OPENAI_API_KEY");
		this.baseUrl = config.baseUrl || "https://api.openai.com/v1";
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const messages = this.buildMessages(input, overrides);

			// Build request body, omitting undefined values
			const body: Record<string, unknown> = {
				model: cfg.model,
				messages,
				temperature: cfg.temperature ?? 0,
			};

			// Use max_completion_tokens for newer models, max_tokens for legacy
			if (cfg.maxTokens != null) {
				body.max_completion_tokens = cfg.maxTokens;
			}
			if (cfg.topP != null) body.top_p = cfg.topP;
			if (cfg.frequencyPenalty != null) body.frequency_penalty = cfg.frequencyPenalty;
			if (cfg.presencePenalty != null) body.presence_penalty = cfg.presencePenalty;
			if (cfg.stopSequences != null) body.stop = cfg.stopSequences;

			const response = await fetch(`${this.baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(body),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			const data = (await response.json()) as Record<string, unknown>;
			const latencyMs = Date.now() - startTime;

			if (!response.ok) {
				const err = data.error as Record<string, unknown> | undefined;
				const errorMsg =
					(err?.message as string) || JSON.stringify(data) || `HTTP ${response.status}`;

				// Throw on retryable errors so the retry handler can catch them
				if (RETRYABLE_STATUS_CODES.has(response.status)) {
					throw new Error(`OpenAI API error (${response.status}): ${errorMsg}`);
				}

				return {
					output: "",
					latencyMs,
					tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					error: `OpenAI API error (${response.status}): ${errorMsg}`,
				};
			}

			const choices = data.choices as Array<Record<string, unknown>> | undefined;
			const message = choices?.[0]?.message as Record<string, unknown> | undefined;
			const output = (message?.content as string) ?? "";
			const usage = (data.usage ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.prompt_tokens ?? 0,
					outputTokens: usage.completion_tokens ?? 0,
					totalTokens: usage.total_tokens ?? 0,
				},
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			// Re-throw so the retry handler can catch retryable errors
			if (error instanceof Error && error.message.startsWith("OpenAI API error")) {
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
