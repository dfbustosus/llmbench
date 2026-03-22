import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export class GoogleProvider extends BaseProvider {
	private apiKey: string;
	private baseUrl: string;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "google" });
		this.apiKey = this.resolveApiKey(config.apiKey, "GOOGLE_AI_API_KEY");
		this.baseUrl = config.baseUrl || "https://generativelanguage.googleapis.com/v1beta";
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		const startTime = Date.now();

		try {
			const allMessages = this.buildMessages(input, overrides);

			// Google uses systemInstruction for system messages, contents for the rest
			const systemMessages = allMessages.filter((m) => m.role === "system");
			const nonSystemMessages = allMessages.filter((m) => m.role !== "system");
			const systemText = systemMessages.map((m) => m.content).join("\n\n");

			// Map to Google's content format (role: "user" | "model")
			const contents = nonSystemMessages.map((m) => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			}));

			const generationConfig: Record<string, unknown> = {
				temperature: cfg.temperature ?? 0,
				maxOutputTokens: cfg.maxTokens,
				topP: cfg.topP,
				stopSequences: cfg.stopSequences,
			};
			if (cfg.responseFormat?.type === "json_object") {
				generationConfig.responseMimeType = "application/json";
			}

			const body: Record<string, unknown> = {
				contents,
				generationConfig,
			};

			if (systemText) {
				body.systemInstruction = { parts: [{ text: systemText }] };
			}

			const url = `${this.baseUrl}/models/${cfg.model}:generateContent`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": this.apiKey,
				},
				signal: this.createTimeoutSignal(cfg.timeoutMs),
				body: JSON.stringify(body),
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
