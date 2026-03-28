import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

const SQL_KEYWORD_PATTERN =
	/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH|EXPLAIN|MERGE|TRUNCATE|GRANT|REVOKE|REPLACE|UPSERT|BEGIN|COMMIT|ROLLBACK|SET|SHOW|DESCRIBE|USE|CALL|EXEC|EXECUTE)\b/i;

/**
 * Validates that the output appears to be valid SQL.
 * Heuristic-based: checks for SQL keyword, balanced parentheses,
 * and unclosed string literals. Not a full SQL parser.
 *
 * Deterministic — no LLM calls. Can be used as an inline assertion.
 */
export class IsSqlScorer implements IScorer {
	readonly id = "is-sql";
	readonly name = "Is SQL";
	readonly type: ScorerType = "is-sql";

	async score(output: string, _expected: string): Promise<ScoreResult> {
		const trimmed = output.trim();
		if (trimmed.length === 0) {
			return this.fail("Output is empty");
		}

		// Strip trailing semicolon for keyword check
		const normalized = trimmed.replace(/;\s*$/, "").trim();
		if (!SQL_KEYWORD_PATTERN.test(normalized)) {
			return this.fail("Output does not start with a recognized SQL keyword");
		}

		// Single-pass check for balanced parentheses and unclosed string literals.
		// Parentheses inside string literals are ignored.
		// SQL escapes quotes by doubling: 'O''Brien' is valid.
		let depth = 0;
		let inString = false;
		for (let i = 0; i < trimmed.length; i++) {
			const ch = trimmed[i];
			if (ch === "'") {
				if (inString && i + 1 < trimmed.length && trimmed[i + 1] === "'") {
					i++; // Skip escaped quote ('')
				} else {
					inString = !inString;
				}
			} else if (!inString) {
				if (ch === "(") depth++;
				if (ch === ")") depth--;
				if (depth < 0) return this.fail("Unbalanced parentheses");
			}
		}
		if (inString) {
			return this.fail("Unclosed string literal");
		}
		if (depth !== 0) {
			return this.fail("Unbalanced parentheses");
		}

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 1,
			reason: "Output appears to be valid SQL",
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
