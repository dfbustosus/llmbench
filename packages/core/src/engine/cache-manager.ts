import { createHash } from "node:crypto";
import type { CacheRepository } from "@llmbench/db";
import type { CacheConfig, ChatMessage, ProviderConfig, ProviderResponse } from "@llmbench/types";

export class CacheManager {
	private ttlHours: number | undefined;

	constructor(
		private repo: CacheRepository,
		config?: CacheConfig,
	) {
		this.ttlHours = config?.ttlHours;
	}

	computeKey(
		providerId: string,
		model: string,
		input: string | ChatMessage[],
		config?: Partial<ProviderConfig>,
	): string {
		const keyData = {
			providerId,
			model,
			input,
			temperature: config?.temperature,
			maxTokens: config?.maxTokens,
			topP: config?.topP,
			frequencyPenalty: config?.frequencyPenalty,
			presencePenalty: config?.presencePenalty,
			stopSequences: config?.stopSequences,
			systemMessage: config?.systemMessage,
			responseFormat: config?.responseFormat,
		};

		return createHash("sha256").update(JSON.stringify(keyData)).digest("hex");
	}

	async get(
		providerId: string,
		model: string,
		input: string | ChatMessage[],
		config?: Partial<ProviderConfig>,
	): Promise<ProviderResponse | null> {
		const key = this.computeKey(providerId, model, input, config);
		const entry = await this.repo.findByKey(key);

		if (!entry) return null;

		// Check expiry
		if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
			return null;
		}

		await this.repo.incrementHits(entry.id);

		return {
			output: entry.output,
			latencyMs: 0,
			tokenUsage: entry.tokenUsage ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
		};
	}

	async set(
		providerId: string,
		model: string,
		input: string | ChatMessage[],
		config: Partial<ProviderConfig> | undefined,
		response: ProviderResponse,
	): Promise<void> {
		const key = this.computeKey(providerId, model, input, config);

		let expiresAt: string | undefined;
		if (this.ttlHours) {
			const expires = new Date();
			expires.setTime(expires.getTime() + this.ttlHours * 60 * 60 * 1000);
			expiresAt = expires.toISOString();
		}

		const serializedInput = typeof input === "string" ? input : JSON.stringify(input);

		try {
			await this.repo.create({
				cacheKey: key,
				model,
				input: serializedInput,
				output: response.output,
				tokenUsage: response.tokenUsage,
				latencyMs: response.latencyMs,
				expiresAt,
			});
		} catch {
			// Ignore duplicate key errors from concurrent inserts
		}
	}
}
