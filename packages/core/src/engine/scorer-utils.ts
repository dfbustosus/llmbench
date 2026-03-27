import type { IScorer, ScorerConfig, TestCaseAssertion } from "@llmbench/types";
import { createScorer } from "../scorers/index.js";

const UNSUPPORTED_INLINE_TYPES = new Set([
	"llm-judge",
	"composite",
	"embedding-similarity",
	"context-precision",
	"context-recall",
	"faithfulness",
	"answer-relevancy",
]);

/**
 * Creates an IScorer from a per-test-case assertion.
 * Shared by EvaluationEngine (initial run) and RescoringEngine (re-score).
 */
export function createScorerFromAssertion(assertion: TestCaseAssertion): IScorer {
	if (UNSUPPORTED_INLINE_TYPES.has(assertion.type)) {
		throw new Error(
			`Scorer type "${assertion.type}" cannot be used as an inline assertion. ` +
				"Define it as a global scorer in your config instead.",
		);
	}

	const name = assertion.type
		.split("-")
		.map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(" ");

	const config: ScorerConfig = {
		id: assertion.type,
		name,
		type: assertion.type,
		weight: assertion.weight,
		options: assertion.options,
	};

	return createScorer(config);
}
