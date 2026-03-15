import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { AwsClient } from "aws4fetch";
import { BaseProvider } from "./base-provider.js";

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

			const inferenceConfig: Record<string, unknown> = {};
			if (cfg.maxTokens != null) inferenceConfig.maxTokens = cfg.maxTokens;
			if (cfg.temperature != null) inferenceConfig.temperature = cfg.temperature;
			if (cfg.topP != null) inferenceConfig.topP = cfg.topP;
			if (cfg.stopSequences != null) inferenceConfig.stopSequences = cfg.stopSequences;

			if (Object.keys(inferenceConfig).length > 0) {
				body.inferenceConfig = inferenceConfig;
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

			// Converse response: output.message.content[0].text
			const outputMsg = data.output as Record<string, unknown> | undefined;
			const message = outputMsg?.message as Record<string, unknown> | undefined;
			const contentBlocks = message?.content as Array<{ text?: string }> | undefined;
			const output = contentBlocks?.map((b) => b.text ?? "").join("") ?? "";

			const usage = (data.usage ?? {}) as Record<string, number>;

			return {
				output,
				latencyMs,
				tokenUsage: {
					inputTokens: usage.inputTokens ?? 0,
					outputTokens: usage.outputTokens ?? 0,
					totalTokens: (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
				},
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
}
