import type { ProviderConfig } from "@llmbench/types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

/**
 * Together AI provider.
 *
 * OpenAI-compatible API at https://api.together.xyz/v1.
 * Uses `max_tokens` (not `max_completion_tokens`).
 *
 * Env var: TOGETHER_API_KEY
 */
export class TogetherProvider extends OpenAICompatibleProvider {
	constructor(config: ProviderConfig) {
		super(config, "together", "TOGETHER_API_KEY", "https://api.together.xyz/v1");
	}

	protected override setMaxTokens(body: Record<string, unknown>, maxTokens: number): void {
		body.max_tokens = maxTokens;
	}
}
