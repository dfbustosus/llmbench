import type { IProvider, IScorer, ScorerConfig } from "@llmbench/types";
import { ErrorCode, ScorerError } from "@llmbench/types";
import { GoalCompletionScorer } from "./agent/goal-completion.js";
import { ToolCallAccuracyScorer } from "./agent/tool-call-accuracy.js";
import { TrajectoryValidationScorer } from "./agent/trajectory-validation.js";
import { WeightedAverageScorer } from "./composite/weighted-average.js";
import { ContainsScorer } from "./deterministic/contains.js";
import { ExactMatchScorer } from "./deterministic/exact-match.js";
import { IsJsonScorer } from "./deterministic/is-json.js";
import { IsSqlScorer } from "./deterministic/is-sql.js";
import { IsValidFunctionCallScorer } from "./deterministic/is-valid-function-call.js";
import { IsXmlScorer } from "./deterministic/is-xml.js";
import { JsonMatchScorer } from "./deterministic/json-match.js";
import { JsonSchemaScorer } from "./deterministic/json-schema.js";
import { RegexScorer } from "./deterministic/regex.js";
import { LLMJudgeScorer } from "./llm-judge/llm-judge.js";
import { AnswerRelevancyScorer } from "./rag/answer-relevancy.js";
import { ContextPrecisionScorer } from "./rag/context-precision.js";
import { ContextRecallScorer } from "./rag/context-recall.js";
import { FaithfulnessScorer } from "./rag/faithfulness.js";
import { BleuScorer } from "./semantic/bleu.js";
import { CosineSimilarityScorer } from "./semantic/cosine-similarity.js";
import type { EmbedFn } from "./semantic/embedding-similarity.js";
import { EmbeddingSimilarityScorer } from "./semantic/embedding-similarity.js";
import { LevenshteinScorer } from "./semantic/levenshtein.js";
import { RougeScorer } from "./semantic/rouge.js";

export * from "./agent/index.js";
export { computeScorerAverages } from "./averages.js";
export * from "./composite/index.js";
export * from "./deterministic/index.js";
export * from "./llm-judge/index.js";
export * from "./rag/index.js";
export * from "./semantic/index.js";

export interface CreateScorerOptions {
	/** Required for llm-judge type */
	provider?: IProvider;
	/** Required for composite type — array of { scorer, weight } */
	components?: Array<{ scorer: IScorer; weight: number }>;
	/** Required for embedding-similarity type */
	embedFn?: EmbedFn;
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
		case "json-schema":
			return new JsonSchemaScorer({
				strict: opts.strict as boolean | undefined,
			});
		case "is-json":
			return new IsJsonScorer({
				strict: opts.strict as boolean | undefined,
			});
		case "is-sql":
			return new IsSqlScorer();
		case "is-xml":
			return new IsXmlScorer();
		case "is-valid-function-call":
			return new IsValidFunctionCallScorer();
		case "cosine-similarity":
			return new CosineSimilarityScorer();
		case "levenshtein":
			return new LevenshteinScorer({
				caseSensitive: opts.caseSensitive as boolean | undefined,
			});
		case "bleu":
			return new BleuScorer({
				maxN: opts.maxN as number | undefined,
				weights: opts.weights as number[] | undefined,
			});
		case "rouge":
			return new RougeScorer({
				variant: opts.variant as "rouge-l" | "rouge-n" | undefined,
				n: opts.n as number | undefined,
			});
		case "embedding-similarity": {
			if (!options?.embedFn) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Embedding similarity scorer requires an embedFn in options",
				);
			}
			return new EmbeddingSimilarityScorer(options.embedFn);
		}
		case "llm-judge": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"LLM judge scorer requires a provider in options",
				);
			}
			return new LLMJudgeScorer(options.provider, {
				name: config.name,
				promptTemplate: opts.promptTemplate as string | undefined,
			});
		}
		case "composite": {
			if (!options?.components || options.components.length === 0) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Composite scorer requires components in options",
				);
			}
			return new WeightedAverageScorer(options.components, config.name);
		}
		case "context-precision": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Context precision scorer requires a provider in options",
				);
			}
			return new ContextPrecisionScorer(options.provider);
		}
		case "context-recall": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Context recall scorer requires a provider in options",
				);
			}
			return new ContextRecallScorer(options.provider);
		}
		case "faithfulness": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Faithfulness scorer requires a provider in options",
				);
			}
			return new FaithfulnessScorer(options.provider);
		}
		case "answer-relevancy": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Answer relevancy scorer requires a provider in options",
				);
			}
			return new AnswerRelevancyScorer(options.provider, {
				numQuestions: opts.numQuestions as number | undefined,
			});
		}
		case "tool-call-accuracy":
			return new ToolCallAccuracyScorer();
		case "trajectory-validation":
			return new TrajectoryValidationScorer();
		case "goal-completion": {
			if (!options?.provider) {
				throw new ScorerError(
					ErrorCode.SCORER_INVALID_CONFIG,
					"Goal completion scorer requires a provider in options",
				);
			}
			return new GoalCompletionScorer(options.provider);
		}
		default:
			throw new ScorerError(
				ErrorCode.SCORER_NOT_FOUND,
				`Unknown scorer type: ${config.type}`,
				config.type,
			);
	}
}
