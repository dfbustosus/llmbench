import type {
	ChatMessage,
	ProviderConfig,
	ProviderResponse,
	TokenUsage,
	ToolCall,
} from "@llmbench/types";
import { AwsClient } from "aws4fetch";
import { BaseProvider } from "./base-provider.js";
import { parseBedrockEventStream } from "./streaming/bedrock-event-stream-parser.js";

/** HTTP status codes that are worth retrying */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * AWS Bedrock provider using the Converse API.
 *
 * Uses `aws4fetch` for SigV4 signing — zero AWS SDK dependency.
 *
 * Required env vars:
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
 * Optional:
 *   AWS_SESSION_TOKEN (for temporary credentials)
 */
export class BedrockProvider extends BaseProvider {
	private awsClient: AwsClient;
	private region: string;
	private jsonModeWarned = false;

	constructor(config: ProviderConfig) {
		super({ ...config, type: "bedrock" });

		const accessKeyId = (config.extra?.accessKeyId as string) || process.env.AWS_ACCESS_KEY_ID;
		const secretAccessKey =
			(config.extra?.secretAccessKey as string) || process.env.AWS_SECRET_ACCESS_KEY;
		this.region = (config.extra?.region as string) || process.env.AWS_REGION || "us-east-1";
		const sessionToken = (config.extra?.sessionToken as string) || process.env.AWS_SESSION_TOKEN;

		if (!accessKeyId || !secretAccessKey) {
			throw new Error(
				"Bedrock provider requires AWS credentials. " +
					"Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables " +
					"or pass them in config.extra.",
			);
		}

		this.awsClient = new AwsClient({
			accessKeyId,
			secretAccessKey,
			sessionToken,
			service: "bedrock",
			region: this.region,
		});
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

			// Bedrock Converse: system messages go in a separate top-level field
			const systemMessages = allMessages.filter((m) => m.role === "system");
			const conversationMessages = allMessages.filter((m) => m.role !== "system");

			const body: Record<string, unknown> = {
				messages: conversationMessages.map((m) => ({
					role: m.role,
					content: [{ text: m.content }],
				})),
			};

			if (systemMessages.length > 0) {
				body.system = systemMessages.map((m) => ({ text: m.content }));
			}

			if (cfg.responseFormat?.type === "json_object") {
				if (!this.jsonModeWarned) {
					console.warn(
						"[llmbench] Bedrock Converse API does not natively support JSON mode. " +
							"Adding system prompt instruction for JSON output.",
					);
					this.jsonModeWarned = true;
				}
				const jsonInstruction = {
					text: "You must respond with valid JSON only. No markdown, no explanation, just valid JSON.",
				};
				if (body.system) {
					(body.system as Array<{ text: string }>).push(jsonInstruction);
				} else {
					body.system = [jsonInstruction];
				}
			}

			const inferenceConfig: Record<string, unknown> = {};
			if (cfg.maxTokens != null) inferenceConfig.maxTokens = cfg.maxTokens;
			if (cfg.temperature != null) inferenceConfig.temperature = cfg.temperature;
			if (cfg.topP != null) inferenceConfig.topP = cfg.topP;
			if (cfg.stopSequences != null) inferenceConfig.stopSequences = cfg.stopSequences;

			if (Object.keys(inferenceConfig).length > 0) {
				body.inferenceConfig = inferenceConfig;
			}
			if (cfg.tools?.length && cfg.toolChoice !== "none") {
				const toolConfig: Record<string, unknown> = {
					tools: cfg.tools.map((t) => ({
						toolSpec: {
							name: t.function.name,
							description: t.function.description,
							inputSchema: { json: t.function.parameters ?? { type: "object" } },
						},
					})),
				};
				if (cfg.toolChoice != null) {
					if (cfg.toolChoice === "auto") toolConfig.toolChoice = { auto: {} };
					else if (cfg.toolChoice === "required") toolConfig.toolChoice = { any: {} };
					else toolConfig.toolChoice = { tool: { name: cfg.toolChoice.function.name } };
				}
				body.toolConfig = toolConfig;
			}

			const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(cfg.model)}/converse`;

			const response = await this.awsClient.fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			const data = (await response.json()) as Record<string, unknown>;
			const latencyMs = Date.now() - startTime;

			if (!response.ok) {
				const errorMsg =
					(data.message as string) || JSON.stringify(data) || `HTTP ${response.status}`;

				if (RETRYABLE_STATUS_CODES.has(response.status)) {
					throw new Error(`Bedrock API error (${response.status}): ${errorMsg}`);
				}

				return {
					output: "",
					latencyMs,
					tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
					error: `Bedrock API error (${response.status}): ${errorMsg}`,
				};
			}

			// Converse response: output.message.content[0].text or toolUse
			const outputMsg = data.output as Record<string, unknown> | undefined;
			const message = outputMsg?.message as Record<string, unknown> | undefined;
			const contentBlocks = message?.content as
				| Array<{
						text?: string;
						toolUse?: { toolUseId: string; name: string; input: unknown };
				  }>
				| undefined;

			const textContent =
				contentBlocks
					?.filter((b) => b.text != null)
					.map((b) => b.text ?? "")
					.join("") ?? "";

			// Extract tool calls
			const toolUseBlocks = contentBlocks?.filter((b) => b.toolUse != null) ?? [];
			let toolCalls: ToolCall[] | undefined;
			if (toolUseBlocks.length > 0) {
				toolCalls = toolUseBlocks.map((b) => {
					const tu = b.toolUse;
					return {
						id: tu?.toolUseId ?? "",
						type: "function" as const,
						function: {
							name: tu?.name ?? "",
							arguments: JSON.stringify(tu?.input ?? {}),
						},
					};
				});
			}

			const output = textContent || (toolCalls ? JSON.stringify(toolCalls) : "");
			const usage = (data.usage ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.inputTokens ?? 0,
					outputTokens: usage.outputTokens ?? 0,
					totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
				},
				toolCalls,
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			if (error instanceof Error && error.message.startsWith("Bedrock API error")) {
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
			const allMessages = this.buildMessages(input, overrides);
			const systemMessages = allMessages.filter((m) => m.role === "system");
			const conversationMessages = allMessages.filter((m) => m.role !== "system");

			const body: Record<string, unknown> = {
				messages: conversationMessages.map((m) => ({
					role: m.role,
					content: [{ text: m.content }],
				})),
			};

			if (systemMessages.length > 0) {
				body.system = systemMessages.map((m) => ({ text: m.content }));
			}

			if (cfg.responseFormat?.type === "json_object") {
				if (!this.jsonModeWarned) {
					console.warn(
						"[llmbench] Bedrock Converse API does not natively support JSON mode. " +
							"Adding system prompt instruction for JSON output.",
					);
					this.jsonModeWarned = true;
				}
				const jsonInstruction = {
					text: "You must respond with valid JSON only. No markdown, no explanation, just valid JSON.",
				};
				if (body.system) {
					(body.system as Array<{ text: string }>).push(jsonInstruction);
				} else {
					body.system = [jsonInstruction];
				}
			}

			const inferenceConfig: Record<string, unknown> = {};
			if (cfg.maxTokens != null) inferenceConfig.maxTokens = cfg.maxTokens;
			if (cfg.temperature != null) inferenceConfig.temperature = cfg.temperature;
			if (cfg.topP != null) inferenceConfig.topP = cfg.topP;
			if (cfg.stopSequences != null) inferenceConfig.stopSequences = cfg.stopSequences;
			if (Object.keys(inferenceConfig).length > 0) {
				body.inferenceConfig = inferenceConfig;
			}

			const url = `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(cfg.model)}/converse-stream`;

			const response = await this.awsClient.fetch(url, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
				signal: this.createTimeoutSignal(cfg.timeoutMs),
			});

			if (!response.ok) {
				const data = (await response.json()) as Record<string, unknown>;
				const errorMsg =
					(data.message as string) || JSON.stringify(data) || `HTTP ${response.status}`;

				if (RETRYABLE_STATUS_CODES.has(response.status)) {
					throw new Error(`Bedrock API error (${response.status}): ${errorMsg}`);
				}
				return {
					output: "",
					latencyMs: Date.now() - startTime,
					tokenUsage,
					error: `Bedrock API error (${response.status}): ${errorMsg}`,
				};
			}

			if (!response.body) {
				throw new Error("Bedrock streaming response has no body");
			}

			for await (const event of parseBedrockEventStream(response.body)) {
				if (event.type === "contentBlockDelta") {
					const payload = event.payload as Record<string, unknown>;
					const delta = payload.delta as Record<string, unknown> | undefined;
					const text = delta?.text as string | undefined;
					if (text) {
						if (timeToFirstTokenMs === undefined) {
							timeToFirstTokenMs = Date.now() - startTime;
						}
						chunks.push(text);
					}
				} else if (event.type === "metadata") {
					const payload = event.payload as Record<string, unknown>;
					const usage = payload.usage as Record<string, number> | undefined;
					if (usage) {
						tokenUsage = {
							inputTokens: usage.inputTokens ?? 0,
							outputTokens: usage.outputTokens ?? 0,
							totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
						};
					}
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
			if (error instanceof Error && error.message.startsWith("Bedrock API error")) {
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
