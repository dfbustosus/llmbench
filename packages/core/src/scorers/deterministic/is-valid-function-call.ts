import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

/**
 * Validates that the output is a properly structured function call.
 * Checks for: valid JSON, object with `function.name` (non-empty string)
 * and `function.arguments` (valid JSON string).
 *
 * Does not require `id` or `type` fields (those are API metadata, not LLM output).
 *
 * Deterministic — no LLM calls. Can be used as an inline assertion.
 */
export class IsValidFunctionCallScorer implements IScorer {
	readonly id = "is-valid-function-call";
	readonly name = "Is Valid Function Call";
	readonly type: ScorerType = "is-valid-function-call";

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

		if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
			return this.fail("Output is not a JSON object");
		}

		const obj = parsed as Record<string, unknown>;
		if (!obj.function || typeof obj.function !== "object" || Array.isArray(obj.function)) {
			return this.fail("Missing or invalid 'function' property");
		}

		const fn = obj.function as Record<string, unknown>;
		if (typeof fn.name !== "string" || fn.name.length === 0) {
			return this.fail("Missing or empty 'function.name'");
		}

		if (typeof fn.arguments !== "string") {
			return this.fail("Missing or non-string 'function.arguments'");
		}

		try {
			JSON.parse(fn.arguments);
		} catch {
			return this.fail("'function.arguments' is not valid JSON");
		}

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 1,
			reason: "Output is a valid function call",
			metadata: { functionName: fn.name },
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
