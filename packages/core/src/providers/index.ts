import type { IProvider, ProviderConfig } from "@llmbench/types";
import { AnthropicProvider } from "./anthropic-provider.js";
import type { CustomGenerateFn } from "./custom-provider.js";
import { CustomProvider } from "./custom-provider.js";
import { GoogleProvider } from "./google-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";

export { AnthropicProvider } from "./anthropic-provider.js";
export { BaseProvider } from "./base-provider.js";
export type { CustomGenerateFn } from "./custom-provider.js";
export { CustomProvider } from "./custom-provider.js";
export { GoogleProvider } from "./google-provider.js";
export { OllamaProvider } from "./ollama-provider.js";
export { OpenAIProvider } from "./openai-provider.js";

export function createProvider(config: ProviderConfig, customFn?: CustomGenerateFn): IProvider {
	switch (config.type) {
		case "openai":
			return new OpenAIProvider(config);
		case "anthropic":
			return new AnthropicProvider(config);
		case "google":
			return new GoogleProvider(config);
		case "ollama":
			return new OllamaProvider(config);
		case "custom":
			if (!customFn) throw new Error("Custom provider requires a generate function");
			return new CustomProvider(config, customFn);
		default:
			throw new Error(`Unknown provider type: ${config.type}`);
	}
}
