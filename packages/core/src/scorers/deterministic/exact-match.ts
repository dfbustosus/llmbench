import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export class ExactMatchScorer implements IScorer {
	readonly id = "exact-match";
	readonly name = "Exact Match";
	readonly type: ScorerType = "exact-match";
	private caseSensitive: boolean;
	private trim: boolean;

	constructor(options?: { caseSensitive?: boolean; trim?: boolean }) {
		this.caseSensitive = options?.caseSensitive ?? false;
		this.trim = options?.trim ?? true;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		let a = this.trim ? output.trim() : output;
		let b = this.trim ? expected.trim() : expected;

		if (!this.caseSensitive) {
			a = a.toLowerCase();
			b = b.toLowerCase();
		}

		const match = a === b;

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: match ? 1 : 0,
			reason: match ? "Output exactly matches expected" : "Output does not match expected",
		};
	}
}
