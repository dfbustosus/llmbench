import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	TokenUsage,
	ToolCall,
} from "@llmbench/types";
import { ErrorCode, ProviderError } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";
import { parseNDJSON } from "./streaming/ndjson-parser.js";

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

		if (cfg.stream === true && !cfg.tools?.length) {
			return this.generateStreaming(input, cfg, overrides);
		}

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
			if (cfg.tools?.length && cfg.toolChoice !== "none") requestBody.tools = cfg.tools;

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
			const textContent = (message?.content as string) ?? "";
			const promptEval = (data.prompt_eval_count as number) ?? 0;
			const evalCount = (data.eval_count as number) ?? 0;

			// Extract tool calls (Ollama uses OpenAI-compatible format)
			const rawToolCalls = message?.tool_calls as
				| Array<{ function: { name: string; arguments: Record<string, unknown> } }>
				| undefined;
			let toolCalls: ToolCall[] | undefined;
			if (rawToolCalls?.length) {
				toolCalls = rawToolCalls.map((tc, i) => ({
					id: `ollama-tc-${i}`,
					type: "function" as const,
					function: {
						name: tc.function.name,
						arguments: JSON.stringify(tc.function.arguments ?? {}),
					},
				}));
			}

			const output = textContent || (toolCalls ? JSON.stringify(toolCalls) : "");

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: promptEval,
					outputTokens: evalCount,
					totalTokens: promptEval + evalCount,
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
			const messages = this.buildMessages(input, overrides);

			const requestBody: Record<string, unknown> = {
				model: cfg.model,
				messages,
				stream: true,
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

			if (!response.ok) {
				const data = (await response.json()) as Record<string, unknown>;
				return {
					output: "",
					latencyMs: Date.now() - startTime,
					tokenUsage,
					error: (data.error as string) || `HTTP ${response.status}`,
				};
			}

			if (!response.body) {
				throw new ProviderError(
					ErrorCode.PROVIDER_API_ERROR,
					"Ollama streaming response has no body",
					{ providerName: this.name, providerType: this.type },
				);
			}

			interface OllamaChunk {
				message?: { content?: string };
				done: boolean;
				prompt_eval_count?: number;
				eval_count?: number;
			}

			for await (const chunk of parseNDJSON<OllamaChunk>(response.body)) {
				const content = chunk.message?.content;
				if (content) {
					if (timeToFirstTokenMs === undefined) {
						timeToFirstTokenMs = Date.now() - startTime;
					}
					chunks.push(content);
				}

				if (chunk.done) {
					const promptEval = chunk.prompt_eval_count ?? 0;
					const evalCount = chunk.eval_count ?? 0;
					tokenUsage = {
						inputTokens: promptEval,
						outputTokens: evalCount,
						totalTokens: promptEval + evalCount,
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
