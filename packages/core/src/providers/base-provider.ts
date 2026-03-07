import type { IProvider, ProviderConfig, ProviderResponse, ProviderType } from "@llmbench/types";

export abstract class BaseProvider implements IProvider {
	readonly type: ProviderType;
	readonly name: string;
	readonly model: string;
	protected config: ProviderConfig;

	constructor(config: ProviderConfig) {
		if (!config.type) throw new Error("Provider config must have a 'type'");
		if (!config.name) throw new Error("Provider config must have a 'name'");
		if (!config.model) throw new Error("Provider config must have a 'model'");

		this.type = config.type;
		this.name = config.name;
		this.model = config.model;
		this.config = config;
	}

	abstract generate(input: string, config?: Partial<ProviderConfig>): Promise<ProviderResponse>;

	protected mergeConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
		return { ...this.config, ...overrides };
	}

	protected resolveApiKey(configKey: string | undefined, envVar: string): string {
		const key = configKey || process.env[envVar];
		if (!key) {
			throw new Error(
				`API key required for ${this.name} (${this.type}). ` +
					`Set ${envVar} environment variable or pass apiKey in config.`,
			);
		}
		return key;
	}
}
