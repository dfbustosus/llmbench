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
	| "cosine-similarity"
	| "llm-judge"
	| "composite"
	| "custom";

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

	score(output: string, expected: string, input?: string): Promise<ScoreResult>;
}
