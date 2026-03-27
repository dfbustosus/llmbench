import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { errorResult } from "../rag/utils.js";
import { deepEqual, extractExpectedToolCalls, extractToolCalls, parseArguments } from "./utils.js";

/**
 * Compares actual tool calls against expected tool calls.
 * Checks correct function names and correct arguments (deep-equal, key-order insensitive).
 *
 * Deterministic — no LLM needed. Can be used as an inline assertion.
 *
 * Inputs (via context):
 * - context.toolCalls: ToolCall[] (actual, injected by engine)
 * - context.expectedToolCalls: array of { function: { name, arguments? } }
 *
 * Score: matchedCount / expectedCount
 */
export class ToolCallAccuracyScorer implements IScorer {
	readonly id = "tool-call-accuracy";
	readonly name = "Tool Call Accuracy";
	readonly type: ScorerType = "tool-call-accuracy";

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

		if (actual.length === 0) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 0,
				reason: `0/${expected.length} expected tool calls matched (no actual tool calls)`,
				metadata: { matched: 0, total: expected.length, details: [] },
			};
		}

		// Greedy matching: for each expected call, find best match in actual (not reused)
		const used = new Set<number>();
		const details: Array<{ expected: string; matched: boolean; matchedWith?: string }> = [];
		let matched = 0;

		for (const exp of expected) {
			const expArgs = parseArguments(exp.function.arguments);
			let found = false;

			for (let i = 0; i < actual.length; i++) {
				if (used.has(i)) continue;

				if (actual[i].function.name !== exp.function.name) continue;

				// If expected has arguments, compare them
				if (exp.function.arguments !== undefined && exp.function.arguments.trim().length > 0) {
					const actArgs = parseArguments(actual[i].function.arguments);
					if (!deepEqual(expArgs, actArgs)) continue;
				}

				// Match found
				used.add(i);
				matched++;
				found = true;
				details.push({
					expected: exp.function.name,
					matched: true,
					matchedWith: actual[i].function.name,
				});
				break;
			}

			if (!found) {
				details.push({ expected: exp.function.name, matched: false });
			}
		}

		const value = expected.length > 0 ? matched / expected.length : 0;

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			reason: `${matched}/${expected.length} expected tool calls matched`,
			metadata: { matched, total: expected.length, details },
		};
	}
}
