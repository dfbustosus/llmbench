import type { ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export class GoogleProvider extends BaseProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "google" });
		this.apiKey = this.resolveApiKey(config.apiKey, "GOOGLE_AI_API_KEY");
		this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
	}

	async generate(input: string, overrides?: Partial<ProviderConfig>): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const url = `${this.baseUrl}/models/${cfg.model}:generateContent`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": this.apiKey,
				},
				signal: this.createTimeoutSignal(cfg.timeoutMs),
				body: JSON.stringify({
					contents: [{ parts: [{ text: input }] }],
					generationConfig: {
						temperature: cfg.temperature ?? 0,
						maxOutputTokens: cfg.maxTokens,
						topP: cfg.topP,
						stopSequences: cfg.stopSequences,
					},
				}),
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

			const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
			const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as
				| Array<{ text?: string }>
				| undefined;
			const output = parts?.map((p) => p.text ?? "").join("") ?? "";

			const usage = (data.usageMetadata ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.promptTokenCount ?? 0,
					outputTokens: usage.candidatesTokenCount ?? 0,
					totalTokens: usage.totalTokenCount ?? 0,
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
