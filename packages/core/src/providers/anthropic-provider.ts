import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	TokenUsage,
	ToolCall,
} from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";
import { parseSSE } from "./streaming/sse-parser.js";

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

		if (cfg.stream === true && !cfg.tools?.length) {
			return this.generateStreaming(input, cfg, overrides);
		}

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
			if (cfg.tools?.length) {
				body.tools = cfg.tools.map((t) => ({
					name: t.function.name,
					description: t.function.description,
					input_schema: t.function.parameters ?? { type: "object" },
				}));
			}
			if (cfg.toolChoice != null) {
				if (cfg.toolChoice === "auto") body.tool_choice = { type: "auto" };
				else if (cfg.toolChoice === "required") body.tool_choice = { type: "any" };
				else if (cfg.toolChoice === "none") {
					// Omit tools entirely for "none"
					delete body.tools;
				} else body.tool_choice = { type: "tool", name: cfg.toolChoice.function.name };
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

			const content = data.content as
				| Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>
				| undefined;
			const textContent =
				content
					?.filter((b) => b.type === "text")
					.map((b) => b.text ?? "")
					.join("") ?? "";

			// Extract tool calls
			const toolUseBlocks = content?.filter((b) => b.type === "tool_use") ?? [];
			let toolCalls: ToolCall[] | undefined;
			if (toolUseBlocks.length > 0) {
				toolCalls = toolUseBlocks.map((b) => ({
					id: b.id ?? "",
					type: "function" as const,
					function: {
						name: b.name ?? "",
						arguments: JSON.stringify(b.input ?? {}),
					},
				}));
			}

			const output = textContent || (toolCalls ? JSON.stringify(toolCalls) : "");
			const usage = (data.usage ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.input_tokens ?? 0,
					outputTokens: usage.output_tokens ?? 0,
					totalTokens: (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0),
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
		const tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

		try {
			const allMessages = this.buildMessages(input, overrides);
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
				stream: true,
			};

			if (systemText) body.system = systemText;

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
				throw new Error("Anthropic streaming response has no body");
			}

			for await (const event of parseSSE(response.body)) {
				const parsed = JSON.parse(event.data) as Record<string, unknown>;

				if (event.event === "message_start") {
					const msg = parsed.message as Record<string, unknown> | undefined;
					const usage = msg?.usage as Record<string, number> | undefined;
					if (usage) {
						tokenUsage.inputTokens = usage.input_tokens ?? 0;
					}
				} else if (event.event === "content_block_delta") {
					const delta = parsed.delta as Record<string, unknown> | undefined;
					const text = delta?.text as string | undefined;
					if (text) {
						if (timeToFirstTokenMs === undefined) {
							timeToFirstTokenMs = Date.now() - startTime;
						}
						chunks.push(text);
					}
				} else if (event.event === "message_delta") {
					const usage = parsed.usage as Record<string, number> | undefined;
					if (usage) {
						tokenUsage.outputTokens = usage.output_tokens ?? 0;
						tokenUsage.totalTokens = tokenUsage.inputTokens + tokenUsage.outputTokens;
					}
				} else if (event.event === "message_stop") {
					break;
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
