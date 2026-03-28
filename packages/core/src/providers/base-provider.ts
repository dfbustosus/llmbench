import type {
	ChatMessage,
	IProvider,
	ProviderConfig,
	ProviderResponse,
	ProviderType,
	ResponseFormat,
	ToolChoice,
	ToolDefinition,
} from "@llmbench/types";
import { ConfigError, ErrorCode, ProviderError } from "@llmbench/types";

export abstract class BaseProvider implements IProvider {
	readonly type: ProviderType;
	readonly name: string;
	readonly model: string;
	readonly systemMessage?: string;
	readonly responseFormat?: ResponseFormat;
	readonly tools?: ToolDefinition[];
	readonly toolChoice?: ToolChoice;
	protected config: ProviderConfig;

	constructor(config: ProviderConfig) {
		if (!config.type)
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"Provider config must have a 'type'",
				"type",
			);
		if (!config.name)
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"Provider config must have a 'name'",
				"name",
			);
		if (!config.model)
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"Provider config must have a 'model'",
				"model",
			);

		this.type = config.type;
		this.name = config.name;
		this.model = config.model;
		this.systemMessage = config.systemMessage;
		this.responseFormat = config.responseFormat;
		this.tools = config.tools;
		this.toolChoice = config.toolChoice;
		this.config = config;
	}

	abstract generate(
		input: string | ChatMessage[],
		config?: Partial<ProviderConfig>,
	): Promise<ProviderResponse>;

	/**
	 * Build a ChatMessage[] from the input, prepending the system message
	 * from config if one is configured and not already present in the input.
	 */
	protected buildMessages(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): ChatMessage[] {
		const systemMsg = overrides?.systemMessage ?? this.config.systemMessage;

		if (typeof input === "string") {
			const messages: ChatMessage[] = [];
			if (systemMsg) {
				messages.push({ role: "system", content: systemMsg });
			}
			messages.push({ role: "user", content: input });
			return messages;
		}

		// If messages already include a system message, use them as-is
		const hasSystem = input.some((m) => m.role === "system");
		if (!hasSystem && systemMsg) {
			return [{ role: "system", content: systemMsg }, ...input];
		}
		return input;
	}

	protected mergeConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
		return { ...this.config, ...overrides };
	}

	protected createTimeoutSignal(overrideMs?: number): AbortSignal | undefined {
		const ms = overrideMs ?? this.config.timeoutMs;
		return ms ? AbortSignal.timeout(ms) : undefined;
	}

	protected resolveApiKey(configKey: string | undefined, envVar: string): string {
		const key = configKey || process.env[envVar];
		if (!key) {
			throw new ProviderError(
				ErrorCode.PROVIDER_AUTH_ERROR,
				`API key required for ${this.name} (${this.type}). ` +
					`Set ${envVar} environment variable or pass apiKey in config.`,
				{ providerName: this.name, providerType: this.type },
			);
		}
		return key;
	}
}
