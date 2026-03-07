import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export class RegexScorer implements IScorer {
	readonly id = "regex";
	readonly name = "Regex Match";
	readonly type: ScorerType = "regex";
	private flags: string;

	constructor(options?: { flags?: string }) {
		this.flags = options?.flags ?? "i";
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		try {
			const regex = new RegExp(expected, this.flags);
			const match = regex.test(output);

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: match ? 1 : 0,
				reason: match ? "Output matches regex pattern" : "Output does not match regex pattern",
			};
		} catch (error) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 0,
				reason: `Invalid regex pattern: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
