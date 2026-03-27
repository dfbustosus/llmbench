import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { errorResult } from "../rag/utils.js";
import { extractExpectedToolCalls, extractToolCalls } from "./utils.js";

/**
 * Validates that tool calls follow the expected trajectory (order).
 * Uses Longest Common Subsequence (LCS) to allow extra calls between
 * expected steps without penalty.
 *
 * Deterministic — no LLM needed. Can be used as an inline assertion.
 *
 * Inputs (via context):
 * - context.toolCalls: ToolCall[] (actual, injected by engine)
 * - context.expectedToolCalls: array of { function: { name } }
 *
 * Score: lcsLength / expectedLength
 */
export class TrajectoryValidationScorer implements IScorer {
	readonly id = "trajectory-validation";
	readonly name = "Trajectory Validation";
	readonly type: ScorerType = "trajectory-validation";

	async score(
		_output: string,
		_expected: string,
		_input?: string,
		context?: Record<string, unknown>,
	): Promise<ScoreResult> {
		const actual = extractToolCalls(context);
		const expected = extractExpectedToolCalls(context);

		if (expected.length === 0) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				"No 'expectedToolCalls' found in test case context",
			);
		}

		const actualNames = actual.map((tc) => tc.function.name);
		const expectedNames = expected.map((tc) => tc.function.name);

		if (actualNames.length === 0) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 0,
				reason: `0/${expectedNames.length} trajectory steps matched (no actual tool calls)`,
				metadata: {
					lcsLength: 0,
					expectedLength: expectedNames.length,
					actualNames,
					expectedNames,
				},
			};
		}

		const lcsLen = lcs(actualNames, expectedNames);
		const value = expectedNames.length > 0 ? lcsLen / expectedNames.length : 0;

		// Identify which expected steps were missing
		const matchedIndices = lcsSequence(actualNames, expectedNames);
		const missingSteps = expectedNames
			.map((name, i) => ({ name, index: i }))
			.filter((s) => !matchedIndices.includes(s.index))
			.map((s) => s.name);

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			reason: `${lcsLen}/${expectedNames.length} trajectory steps in correct order`,
			metadata: {
				lcsLength: lcsLen,
				expectedLength: expectedNames.length,
				actualNames,
				expectedNames,
				matchedIndices,
				missingSteps,
			},
		};
	}
}

/**
 * Computes the length of the Longest Common Subsequence of two string arrays.
 * O(n*m) dynamic programming — fine for typical tool call sequences (<100).
 */
function lcs(a: string[], b: string[]): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	return dp[m][n];
}

/**
 * Returns the indices in `b` that are part of the LCS match.
 * Used to identify which expected steps were matched.
 */
function lcsSequence(a: string[], b: string[]): number[] {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (a[i - 1] === b[j - 1]) {
				dp[i][j] = dp[i - 1][j - 1] + 1;
			} else {
				dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
			}
		}
	}

	// Backtrack to find matched indices in b
	const matched: number[] = [];
	let i = m;
	let j = n;
	while (i > 0 && j > 0) {
		if (a[i - 1] === b[j - 1]) {
			matched.unshift(j - 1);
			i--;
			j--;
		} else if (dp[i - 1][j] > dp[i][j - 1]) {
			i--;
		} else {
			j--;
		}
	}

	return matched;
}
