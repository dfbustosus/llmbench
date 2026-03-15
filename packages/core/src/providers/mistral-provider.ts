import type { ProviderConfig } from "@llmbench/types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

/**
 * Mistral AI provider.
 *
 * OpenAI-compatible API at https://api.mistral.ai/v1.
 * Uses `max_tokens` (not `max_completion_tokens`).
 *
 * Env var: MISTRAL_API_KEY
 */
export class MistralProvider extends OpenAICompatibleProvider {
	constructor(config: ProviderConfig) {
		super(config, "mistral", "MISTRAL_API_KEY", "https://api.mistral.ai/v1");
	}

	protected override setMaxTokens(body: Record<string, unknown>, maxTokens: number): void {
		body.max_tokens = maxTokens;
	}
}
