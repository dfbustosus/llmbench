import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export interface LevenshteinOptions {
	caseSensitive?: boolean;
}

export class LevenshteinScorer implements IScorer {
	readonly id = "levenshtein";
	readonly name = "Levenshtein";
	readonly type: ScorerType = "levenshtein";
	private caseSensitive: boolean;

	constructor(options?: LevenshteinOptions) {
		this.caseSensitive = options?.caseSensitive ?? false;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		const a = this.caseSensitive ? output : output.toLowerCase();
		const b = this.caseSensitive ? expected : expected.toLowerCase();

		const maxLen = Math.max(a.length, b.length);

		if (maxLen === 0) {
			return this.result(1.0, 0, 0);
		}

		const editDistance = this.editDistance(a, b);
		const similarity = 1 - editDistance / maxLen;

		return this.result(similarity, editDistance, maxLen);
	}

	private result(value: number, editDistance: number, maxLength: number): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: Math.max(0, Math.min(1, value)),
			rawValue: value,
			reason: `Levenshtein similarity: ${value.toFixed(4)}`,
			metadata: { editDistance, maxLength },
		};
	}

	/** Two-row DP for O(min(m,n)) space. */
	private editDistance(a: string, b: string): number {
		if (a.length > b.length) {
			[a, b] = [b, a];
		}
		const m = a.length;
		const n = b.length;

		let prev = new Array<number>(m + 1);
		let curr = new Array<number>(m + 1);

		for (let j = 0; j <= m; j++) {
			prev[j] = j;
		}

		for (let i = 1; i <= n; i++) {
			curr[0] = i;
			for (let j = 1; j <= m; j++) {
				if (b[i - 1] === a[j - 1]) {
					curr[j] = prev[j - 1];
				} else {
					curr[j] = 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
				}
			}
			[prev, curr] = [curr, prev];
		}

		return prev[m];
	}
}
