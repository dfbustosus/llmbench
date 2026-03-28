export interface ScoreResult {
	scorerId: string;
	scorerName: string;
	scorerType: ScorerType;
	value: number; // 0-1 normalized
	rawValue?: number;
	reason?: string;
	metadata?: Record<string, unknown>;
}

export type ScorerType =
	| "exact-match"
	| "contains"
	| "regex"
	| "json-match"
	| "json-schema"
	| "cosine-similarity"
	| "levenshtein"
	| "bleu"
	| "rouge"
	| "embedding-similarity"
	| "llm-judge"
	| "composite"
	| "custom"
	| "context-precision"
	| "context-recall"
	| "faithfulness"
	| "answer-relevancy"
	| "tool-call-accuracy"
	| "trajectory-validation"
	| "goal-completion"
	| "is-json"
	| "is-sql"
	| "is-xml"
	| "is-valid-function-call";

export interface ScorerConfig {
	id: string;
	name: string;
	type: ScorerType;
	weight?: number;
	options?: Record<string, unknown>;
}

export interface IScorer {
	readonly id: string;
	readonly name: string;
	readonly type: ScorerType;

	score(
		output: string,
		expected: string,
		input?: string,
		context?: Record<string, unknown>,
	): Promise<ScoreResult>;
}

/** Inline assertion on a single test case. Overrides global scorers when present. */
export interface TestCaseAssertion {
	type: ScorerType;
	/** The expected value this assertion checks against. */
	value: string;
	/** Optional weight when computing a weighted average across assertions. */
	weight?: number;
	/** Scorer-specific options (e.g. caseSensitive, flags, partial). */
	options?: Record<string, unknown>;
}
