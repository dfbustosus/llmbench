import type { CostEstimate, TokenUsage } from "@llmbench/types";
import { PRICING_TABLE } from "./pricing-table.js";

const warnedModels = new Set<string>();

export class CostCalculator {
	calculate(model: string, provider: string, usage: TokenUsage): CostEstimate {
		const pricing = PRICING_TABLE.find((p) => p.model === model && p.provider === provider);

		if (!pricing) {
			const key = `${provider}:${model}`;
			if (!warnedModels.has(key)) {
				warnedModels.add(key);
				console.warn(
					`[CostCalculator] No pricing data for model "${model}" (provider: ${provider}). ` +
						`Cost will be reported as $0. Add pricing to PRICING_TABLE for accurate tracking.`,
				);
			}
			return { inputCost: 0, outputCost: 0, totalCost: 0, currency: "USD" };
		}

		const inputCost = (usage.inputTokens / 1_000_000) * pricing.inputPricePerMillion;
		const outputCost = (usage.outputTokens / 1_000_000) * pricing.outputPricePerMillion;

		return {
			inputCost,
			outputCost,
			totalCost: inputCost + outputCost,
			currency: "USD",
		};
	}
}
