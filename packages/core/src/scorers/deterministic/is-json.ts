import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

/**
 * Validates that the output is parseable JSON.
 * Optional strict mode rejects primitives (only objects/arrays pass).
 *
 * Deterministic — no LLM calls. Can be used as an inline assertion.
 */
export class IsJsonScorer implements IScorer {
	readonly id = "is-json";
	readonly name = "Is JSON";
	readonly type: ScorerType = "is-json";
	private strict: boolean;

	constructor(options?: { strict?: boolean }) {
		this.strict = options?.strict ?? false;
	}

	async score(output: string, _expected: string): Promise<ScoreResult> {
		const trimmed = output.trim();
		if (trimmed.length === 0) {
			return this.fail("Output is empty");
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch (error) {
			return this.fail(
				`Output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (this.strict && (typeof parsed !== "object" || parsed === null)) {
			return this.fail("Output is a JSON primitive, not an object or array");
		}

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 1,
			reason: "Output is valid JSON",
		};
	}

	private fail(reason: string): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 0,
			reason,
		};
	}
}
