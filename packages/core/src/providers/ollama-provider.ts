import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export class OllamaProvider extends BaseProvider {
	private baseUrl: string;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "ollama" });
		this.baseUrl = config.baseUrl || "http://localhost:11434";
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const messages = this.buildMessages(input, overrides);

			const requestBody: Record<string, unknown> = {
				model: cfg.model,
				messages,
				stream: false,
				options: {
					temperature: cfg.temperature ?? 0,
					num_predict: cfg.maxTokens,
					top_p: cfg.topP,
					stop: cfg.stopSequences,
				},
			};
			if (cfg.responseFormat?.type === "json_object") {
				requestBody.format = "json";
			}

			const response = await fetch(`${this.baseUrl}/api/chat`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				signal: this.createTimeoutSignal(cfg.timeoutMs),
				body: JSON.stringify(requestBody),
			});

			const data = (await response.json()) as Record<string, unknown>;
			const latencyMs = Date.now() - startTime;

			if (!response.ok) {
				return {
					output: "",
					latencyMs,
					tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					error: (data.error as string) || `HTTP ${response.status}`,
				};
			}

			const message = data.message as Record<string, unknown> | undefined;
			const output = (message?.content as string) ?? "";
			const promptEval = (data.prompt_eval_count as number) ?? 0;
			const evalCount = (data.eval_count as number) ?? 0;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: promptEval,
					outputTokens: evalCount,
					totalTokens: promptEval + evalCount,
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
