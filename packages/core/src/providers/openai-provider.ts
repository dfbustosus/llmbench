import type { ProviderConfig } from "@llmbench/types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

export class OpenAIProvider extends OpenAICompatibleProvider {
	constructor(config: ProviderConfig) {
		super(config, "openai", "OPENAI_API_KEY", "https://api.openai.com/v1");
	}

	protected override get providerLabel(): string {
		return "OpenAI";
	}
}
