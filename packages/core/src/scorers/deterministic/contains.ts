import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export class ContainsScorer implements IScorer {
	readonly id = "contains";
	readonly name = "Contains";
	readonly type: ScorerType = "contains";
	private caseSensitive: boolean;

	constructor(options?: { caseSensitive?: boolean }) {
		this.caseSensitive = options?.caseSensitive ?? false;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		let a = output;
		let b = expected;

		if (!this.caseSensitive) {
			a = a.toLowerCase();
			b = b.toLowerCase();
		}

		const match = a.includes(b);

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: match ? 1 : 0,
			reason: match ? "Output contains expected text" : "Output does not contain expected text",
		};
	}
}
