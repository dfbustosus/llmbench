import type { IProvider, ProviderConfig } from "@llmbench/types";
import { AnthropicProvider } from "./anthropic-provider.js";
import { AzureOpenAIProvider } from "./azure-openai-provider.js";
import { BedrockProvider } from "./bedrock-provider.js";
import type { CustomGenerateFn } from "./custom-provider.js";
import { CustomProvider } from "./custom-provider.js";
import { GoogleProvider } from "./google-provider.js";
import { MistralProvider } from "./mistral-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { TogetherProvider } from "./together-provider.js";

export { AnthropicProvider } from "./anthropic-provider.js";
export { AzureOpenAIProvider } from "./azure-openai-provider.js";
export { BaseProvider } from "./base-provider.js";
export { BedrockProvider } from "./bedrock-provider.js";
export type { CustomGenerateFn } from "./custom-provider.js";
export { CustomProvider } from "./custom-provider.js";
export { GoogleProvider } from "./google-provider.js";
export { MistralProvider } from "./mistral-provider.js";
export { OllamaProvider } from "./ollama-provider.js";
export { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
export { OpenAIProvider } from "./openai-provider.js";
export { TogetherProvider } from "./together-provider.js";

export function createProvider(config: ProviderConfig, customFn?: CustomGenerateFn): IProvider {
	switch (config.type) {
		case "openai":
			return new OpenAIProvider(config);
		case "azure-openai":
			return new AzureOpenAIProvider(config);
		case "anthropic":
			return new AnthropicProvider(config);
		case "google":
			return new GoogleProvider(config);
		case "mistral":
			return new MistralProvider(config);
		case "together":
			return new TogetherProvider(config);
		case "bedrock":
			return new BedrockProvider(config);
		case "ollama":
			return new OllamaProvider(config);
		case "custom":
			if (!customFn) throw new Error("Custom provider requires a generate function");
			return new CustomProvider(config, customFn);
		default:
			throw new Error(`Unknown provider type: ${config.type}`);
	}
}
