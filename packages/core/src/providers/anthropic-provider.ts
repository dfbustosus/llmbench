import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export class AnthropicProvider extends BaseProvider {
	private apiKey: string;
	private baseUrl: string;
	private jsonModeWarned = false;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "anthropic" });
		this.apiKey = this.resolveApiKey(config.apiKey, "ANTHROPIC_API_KEY");
		this.baseUrl = config.baseUrl || "https://api.anthropic.com/v1";
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const allMessages = this.buildMessages(input, overrides);

			// Anthropic requires system message as a separate top-level field
			const systemMessages = allMessages.filter((m) => m.role === "system");
			const nonSystemMessages = allMessages.filter((m) => m.role !== "system");
			let systemText = systemMessages.map((m) => m.content).join("\n\n");

			if (cfg.responseFormat?.type === "json_object") {
				if (!this.jsonModeWarned) {
					console.warn(
						"[llmbench] Anthropic does not natively support JSON mode. " +
							"Adding system prompt instruction for JSON output.",
					);
					this.jsonModeWarned = true;
				}
				const jsonInstruction =
					"You must respond with valid JSON only. No markdown, no explanation, just valid JSON.";
				systemText = systemText ? `${systemText}\n\n${jsonInstruction}` : jsonInstruction;
			}

			const body: Record<string, unknown> = {
				model: cfg.model,
				max_tokens: cfg.maxTokens ?? 1024,
				messages: nonSystemMessages.map((m) => ({ role: m.role, content: m.content })),
				temperature: cfg.temperature ?? 0,
				top_p: cfg.topP,
				stop_sequences: cfg.stopSequences,
			};

			if (systemText) {
				body.system = systemText;
			}

			const response = await fetch(`${this.baseUrl}/messages`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(body),
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
