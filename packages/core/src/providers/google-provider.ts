import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	TokenUsage,
	ToolCall,
} from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";
import { parseSSE } from "./streaming/sse-parser.js";

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

		if (cfg.stream === true && !cfg.tools?.length) {
			return this.generateStreaming(input, cfg, overrides);
		}

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
			if (cfg.tools?.length) {
				body.tools = [
					{
						functionDeclarations: cfg.tools.map((t) => ({
							name: t.function.name,
							description: t.function.description,
							parameters: t.function.parameters,
						})),
					},
				];
			}
			if (cfg.toolChoice != null) {
				const mode =
					cfg.toolChoice === "auto"
						? "AUTO"
						: cfg.toolChoice === "required"
							? "ANY"
							: cfg.toolChoice === "none"
								? "NONE"
								: "ANY";
				const toolConfig: Record<string, unknown> = {
					function_calling_config: { mode },
				};
				if (typeof cfg.toolChoice === "object") {
					(toolConfig.function_calling_config as Record<string, unknown>).allowed_function_names = [
						cfg.toolChoice.function.name,
					];
				}
				body.tool_config = toolConfig;
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
				| Array<{ text?: string; functionCall?: { name: string; args: unknown } }>
				| undefined;

			const textContent =
				parts
					?.filter((p) => p.text != null)
					.map((p) => p.text ?? "")
					.join("") ?? "";

			// Extract function calls
			const fnCallParts = parts?.filter((p) => p.functionCall != null) ?? [];
			let toolCalls: ToolCall[] | undefined;
			if (fnCallParts.length > 0) {
				toolCalls = fnCallParts.map((p, i) => {
					const fc = p.functionCall;
					return {
						id: `google-tc-${i}`,
						type: "function" as const,
						function: {
							name: fc?.name ?? "",
							arguments: JSON.stringify(fc?.args ?? {}),
						},
					};
				});
			}

			const output = textContent || (toolCalls ? JSON.stringify(toolCalls) : "");
			const usage = (data.usageMetadata ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.promptTokenCount ?? 0,
					outputTokens: usage.candidatesTokenCount ?? 0,
					totalTokens: usage.totalTokenCount ?? 0,
				},
				toolCalls,
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
			const allMessages = this.buildMessages(input, overrides);
			const systemMessages = allMessages.filter((m) => m.role === "system");
			const nonSystemMessages = allMessages.filter((m) => m.role !== "system");
			const systemText = systemMessages.map((m) => m.content).join("\n\n");

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

			const body: Record<string, unknown> = { contents, generationConfig };
			if (systemText) {
				body.systemInstruction = { parts: [{ text: systemText }] };
			}

			const url = `${this.baseUrl}/models/${cfg.model}:streamGenerateContent?alt=sse`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-goog-api-key": this.apiKey,
				},
				signal: this.createTimeoutSignal(cfg.timeoutMs),
				body: JSON.stringify(body),
			});

			if (!response.ok) {
				const data = (await response.json()) as Record<string, unknown>;
				const err = data.error as Record<string, unknown> | undefined;
				return {
					output: "",
					latencyMs: Date.now() - startTime,
					tokenUsage,
					error: (err?.message as string) || `HTTP ${response.status}`,
				};
			}

			if (!response.body) {
				throw new Error("Google streaming response has no body");
			}

			for await (const event of parseSSE(response.body)) {
				const parsed = JSON.parse(event.data) as Record<string, unknown>;
				const candidates = parsed.candidates as Array<Record<string, unknown>> | undefined;
				const parts = (candidates?.[0]?.content as Record<string, unknown>)?.parts as
					| Array<{ text?: string }>
					| undefined;
				const text = parts?.[0]?.text;

				if (text) {
					if (timeToFirstTokenMs === undefined) {
						timeToFirstTokenMs = Date.now() - startTime;
					}
					chunks.push(text);
				}

				const usage = parsed.usageMetadata as Record<string, number> | undefined;
				if (usage) {
					tokenUsage = {
						inputTokens: usage.promptTokenCount ?? 0,
						outputTokens: usage.candidatesTokenCount ?? 0,
						totalTokens: usage.totalTokenCount ?? 0,
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
			return {
				output: chunks.join(""),
				latencyMs: Date.now() - startTime,
				timeToFirstTokenMs,
				tokenUsage,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}
}
