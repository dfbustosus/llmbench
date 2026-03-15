import type { ProviderConfig } from "@llmbench/types";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";

/**
 * Azure OpenAI provider.
 *
 * Requires `baseUrl` set to your Azure endpoint, e.g.:
 *   https://{resource}.openai.azure.com/openai/deployments/{deployment}
 *
 * Uses the `api-key` header instead of `Authorization: Bearer`.
 * Appends `?api-version=2024-10-21` to the endpoint URL.
 *
 * Env var: AZURE_OPENAI_API_KEY
 */
export class AzureOpenAIProvider extends OpenAICompatibleProvider {
	private apiVersion: string;

	constructor(config: ProviderConfig) {
		const baseUrl = config.baseUrl;
		if (!baseUrl) {
			throw new Error(
				"Azure OpenAI provider requires a baseUrl, e.g. " +
					"https://{resource}.openai.azure.com/openai/deployments/{deployment}",
			);
		}
		super(config, "azure-openai", "AZURE_OPENAI_API_KEY", baseUrl);
		this.apiVersion = (config.extra?.apiVersion as string) || "2024-10-21";
	}

	protected override get providerLabel(): string {
		return "Azure OpenAI";
	}

	protected override buildHeaders(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			"api-key": this.apiKey,
		};
	}

	protected override buildEndpointUrl(): string {
		return `${this.baseUrl}/chat/completions?api-version=${this.apiVersion}`;
	}
}
