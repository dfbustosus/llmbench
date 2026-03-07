import type { ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export class AnthropicProvider extends BaseProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "anthropic" });
		this.apiKey = this.resolveApiKey(config.apiKey, "ANTHROPIC_API_KEY");
		this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
	}

	async generate(input: string, overrides?: Partial<ProviderConfig>): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const response = await fetch(`${this.baseUrl}/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify({
					model: cfg.model,
					max_tokens: cfg.maxTokens ?? 1024,
					messages: [{ role: "user", content: input }],
					temperature: cfg.temperature ?? 0,
					top_p: cfg.topP,
					stop_sequences: cfg.stopSequences,
				}),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			const data = (await response.json()) as Record<string, unknown>;
			const latencyMs = Date.now() - startTime;

			if (!response.ok) {
				const err = data.error as Record<string, unknown> | undefined;
				return {
					output: "",
					latencyMs,
					tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					error: (err?.message as string) || `HTTP ${response.status}`,
				};
			}

			const content = data.content as Array<{ type: string; text?: string }> | undefined;
			const output =
				content
					?.filter((b) => b.type === "text")
					.map((b) => b.text ?? "")
					.join("") ?? "";

			const usage = (data.usage ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.input_tokens ?? 0,
					outputTokens: usage.output_tokens ?? 0,
					totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
				},
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			return {
				output: "",
				latencyMs,
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
