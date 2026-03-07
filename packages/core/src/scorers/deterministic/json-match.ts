import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export class JsonMatchScorer implements IScorer {
	readonly id = "json-match";
	readonly name = "JSON Match";
	readonly type: ScorerType = "json-match";
	private partial: boolean;

	constructor(options?: { partial?: boolean }) {
		this.partial = options?.partial ?? false;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		try {
			const outputJson = JSON.parse(output);
			const expectedJson = JSON.parse(expected);

			let match: boolean;
			if (this.partial) {
				match = this.partialMatch(outputJson, expectedJson);
			} else {
				match =
					JSON.stringify(this.sortKeys(outputJson)) === JSON.stringify(this.sortKeys(expectedJson));
			}

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: match ? 1 : 0,
				reason: match ? "JSON structures match" : "JSON structures do not match",
			};
		} catch (error) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 0,
				reason: `JSON parse error: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	private partialMatch(actual: unknown, expected: unknown): boolean {
		if (typeof expected !== "object" || expected === null) {
			return actual === expected;
		}

		if (Array.isArray(expected)) {
			if (!Array.isArray(actual)) return false;
			return expected.every((item, i) => this.partialMatch(actual[i], item));
		}

		if (typeof actual !== "object" || actual === null) return false;
		const actualObj = actual as Record<string, unknown>;
		const expectedObj = expected as Record<string, unknown>;

		return Object.keys(expectedObj).every((key) =>
			this.partialMatch(actualObj[key], expectedObj[key]),
		);
	}

	private sortKeys(obj: unknown): unknown {
		if (typeof obj !== "object" || obj === null) return obj;
		if (Array.isArray(obj)) return obj.map((item) => this.sortKeys(item));

		const sorted: Record<string, unknown> = {};
		for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
			sorted[key] = this.sortKeys((obj as Record<string, unknown>)[key]);
		}
		return sorted;
	}
}
