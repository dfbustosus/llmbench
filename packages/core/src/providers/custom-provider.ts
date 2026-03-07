import type { ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";
import { BaseProvider } from "./base-provider.js";

export type CustomGenerateFn = (
	input: string | ChatMessage[],
	config: ProviderConfig,
) => Promise<ProviderResponse>;

export class CustomProvider extends BaseProvider {
	private generateFn: CustomGenerateFn;

	constructor(config: ProviderConfig, generateFn: CustomGenerateFn) {
		super({ ...config, type: "custom" });
		this.generateFn = generateFn;
	}

	async generate(
		input: string | ChatMessage[],
		overrides?: Partial<ProviderConfig>,
	): Promise<ProviderResponse> {
		const cfg = this.mergeConfig(overrides);
		return this.generateFn(input, cfg);
	}
}
