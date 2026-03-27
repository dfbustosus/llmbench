import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { errorResult, parseJsonResponse, sanitizeForPrompt } from "../rag/utils.js";
import { extractToolCalls } from "./utils.js";

/**
 * LLM-based evaluation of whether the agent achieved its goal.
 * Takes the full context (input, output, tool calls) and judges goal completion.
 *
 * Requires an IProvider for LLM judge calls. Cannot be used as an inline assertion.
 *
 * Inputs:
 * - output: the agent's final response
 * - expected: the expected outcome
 * - input: the goal/task description
 * - context.toolCalls: ToolCall[] (actual, injected by engine)
 *
 * LLM calls: 1 per scored test case.
 */
export class GoalCompletionScorer implements IScorer {
	readonly id = "goal-completion";
	readonly name = "Goal Completion";
	readonly type: ScorerType = "goal-completion";
	private provider: IProvider;

	constructor(provider: IProvider) {
		this.provider = provider;
	}

	async score(
		output: string,
		expected: string,
		input?: string,
		context?: Record<string, unknown>,
	): Promise<ScoreResult> {
		if (!input || input.trim().length === 0) {
			return errorResult(this.id, this.name, this.type, "No input/goal provided");
		}

		const toolCalls = extractToolCalls(context);
		const formattedCalls =
			toolCalls.length > 0
				? toolCalls
						.map((tc, i) => `${i + 1}. ${tc.function.name}(${tc.function.arguments})`)
						.join("\n")
				: "None";

		const prompt = `You are evaluating whether an AI agent successfully achieved its goal.

Goal/Task:
${sanitizeForPrompt(input)}

Expected outcome:
${sanitizeForPrompt(expected || "(not specified)")}

Agent's final response:
${sanitizeForPrompt(output || "(empty)")}

Tool calls made by the agent:
${sanitizeForPrompt(formattedCalls)}

Evaluate whether the agent achieved the stated goal. Consider:
1. Did the agent use appropriate tools?
2. Did the final response address the goal?
3. Were the tool call results used correctly?

Respond with a JSON object:
{
  "score": <number between 0 and 1>,
  "reason": "<brief explanation>"
}

Only respond with valid JSON, nothing else.`;

		try {
			const response = await this.provider.generate(prompt);

			if (response.error) {
				return errorResult(this.id, this.name, this.type, `LLM error: ${response.error}`);
			}

			const parsed = parseJsonResponse(
				response.output,
				(p): { score: number; reason?: string } | null => {
					if (
						p &&
						typeof p === "object" &&
						"score" in p &&
						typeof (p as Record<string, unknown>).score === "number"
					) {
						return p as { score: number; reason?: string };
					}
					return null;
				},
			);

			if (!parsed) {
				return errorResult(
					this.id,
					this.name,
					this.type,
					`Failed to parse LLM response: ${response.output.slice(0, 200)}`,
				);
			}

			const value = Math.max(0, Math.min(1, parsed.score));

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value,
				rawValue: parsed.score,
				reason: typeof parsed.reason === "string" ? parsed.reason : "No reason provided",
				metadata: {
					toolCallCount: toolCalls.length,
					rawJudgement: response.output,
				},
			};
		} catch (error) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				`Goal completion failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}
