import type { IProvider, IScorer, ScorerConfig } from "@llmbench/types";
import { WeightedAverageScorer } from "./composite/weighted-average.js";
import { ContainsScorer } from "./deterministic/contains.js";
import { ExactMatchScorer } from "./deterministic/exact-match.js";
import { JsonMatchScorer } from "./deterministic/json-match.js";
import { RegexScorer } from "./deterministic/regex.js";
import { LLMJudgeScorer } from "./llm-judge/llm-judge.js";
import { CosineSimilarityScorer } from "./semantic/cosine-similarity.js";

export { computeScorerAverages } from "./averages.js";
export * from "./composite/index.js";
export * from "./deterministic/index.js";
export * from "./llm-judge/index.js";
export * from "./semantic/index.js";

export interface CreateScorerOptions {
	/** Required for llm-judge type */
	provider?: IProvider;
	/** Required for composite type — array of { scorer, weight } */
	components?: Array<{ scorer: IScorer; weight: number }>;
}

export function createScorer(config: ScorerConfig, options?: CreateScorerOptions): IScorer {
	const opts = config.options ?? {};

	switch (config.type) {
		case "exact-match":
			return new ExactMatchScorer({
				caseSensitive: opts.caseSensitive as boolean | undefined,
				trim: opts.trim as boolean | undefined,
			});
		case "contains":
			return new ContainsScorer({
				caseSensitive: opts.caseSensitive as boolean | undefined,
			});
		case "regex":
			return new RegexScorer({
				flags: opts.flags as string | undefined,
			});
		case "json-match":
			return new JsonMatchScorer({
				partial: opts.partial as boolean | undefined,
			});
		case "cosine-similarity":
			return new CosineSimilarityScorer();
		case "llm-judge": {
			if (!options?.provider) {
				throw new Error("LLM judge scorer requires a provider in options");
			}
			return new LLMJudgeScorer(options.provider, {
				name: config.name,
				promptTemplate: opts.promptTemplate as string | undefined,
			});
		}
		case "composite": {
			if (!options?.components || options.components.length === 0) {
				throw new Error("Composite scorer requires components in options");
			}
			return new WeightedAverageScorer(options.components, config.name);
		}
		default:
			throw new Error(`Unknown scorer type: ${config.type}`);
	}
}
