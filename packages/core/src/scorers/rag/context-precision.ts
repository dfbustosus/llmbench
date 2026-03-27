import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { errorResult, extractContexts, parseJsonResponse, sanitizeForPrompt } from "./utils.js";

/**
 * Evaluates the ranking quality of retrieved context documents.
 * Measures whether all relevant chunks are ranked near the top.
 *
 * Inputs:
 * - expected: ground truth answer
 * - input: the user question
 * - context.contexts: string[] of retrieved document chunks (in retrieval order)
 *
 * Algorithm: Single LLM call classifies each chunk as useful/not-useful.
 * Computes Average Precision over the ordered verdicts.
 *
 * LLM calls: 1 per scored test case.
 */
export class ContextPrecisionScorer implements IScorer {
	readonly id = "context-precision";
	readonly name = "Context Precision";
	readonly type: ScorerType = "context-precision";
	private provider: IProvider;

	constructor(provider: IProvider) {
		this.provider = provider;
	}

	async score(
		_output: string,
		expected: string,
		input?: string,
		context?: Record<string, unknown>,
	): Promise<ScoreResult> {
		const contexts = extractContexts(context);
		if (contexts.length === 0) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				"No 'contexts' array found in test case context",
			);
		}

		const numberedChunks = contexts
			.map((c, i) => `[${i + 1}] ${sanitizeForPrompt(c)}`)
			.join("\n\n");

		const prompt = `You are evaluating the quality of retrieved context documents for a question-answering task.

Question: ${sanitizeForPrompt(input ?? "")}
Ground truth answer: ${sanitizeForPrompt(expected)}

Retrieved context chunks:
${numberedChunks}

For each context chunk, determine if it is useful for deriving the ground truth answer.

Respond with a JSON object:
{
  "verdicts": [{"useful": true, "reason": "brief explanation"}, ...]
}

You must provide exactly ${contexts.length} verdicts, one per chunk, in order.
Only respond with valid JSON, nothing else.`;

		try {
			const response = await this.provider.generate(prompt);

			if (response.error) {
				return errorResult(this.id, this.name, this.type, `LLM error: ${response.error}`);
			}

			const parsed = parseJsonResponse(response.output, (p) => {
				if (
					p &&
					typeof p === "object" &&
					"verdicts" in p &&
					Array.isArray((p as Record<string, unknown>).verdicts)
				) {
					return (p as { verdicts: unknown[] }).verdicts.map((v) => {
						if (v && typeof v === "object" && "useful" in v) {
							return Boolean((v as { useful: unknown }).useful);
						}
						return false;
					});
				}
				return null;
			});

			if (!parsed) {
				return errorResult(
					this.id,
					this.name,
					this.type,
					`Failed to parse LLM response: ${response.output.slice(0, 200)}`,
				);
			}

			// Pad with false if LLM returned fewer verdicts than chunks,
			// or truncate if it returned more. Prevents misleading AP scores.
			const verdicts =
				parsed.length === contexts.length
					? parsed
					: Array.from({ length: contexts.length }, (_, i) => parsed[i] ?? false);
			const ap = computeAveragePrecision(verdicts);

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: ap,
				reason: `Average Precision: ${ap.toFixed(4)} (${verdicts.filter(Boolean).length}/${verdicts.length} chunks useful)`,
				metadata: { verdicts, totalChunks: contexts.length },
			};
		} catch (error) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				`Context precision failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

/**
 * Computes Average Precision from an ordered array of boolean relevance verdicts.
 * AP = (1/R) * sum_{k: verdict[k]=true}( precision_at_k )
 * where R = total relevant items, precision_at_k = relevant_up_to_k / (k+1).
 */
function computeAveragePrecision(verdicts: boolean[]): number {
	const totalRelevant = verdicts.filter(Boolean).length;
	if (totalRelevant === 0) return 0;

	let cumulativeRelevant = 0;
	let sumPrecision = 0;

	for (let k = 0; k < verdicts.length; k++) {
		if (verdicts[k]) {
			cumulativeRelevant++;
			sumPrecision += cumulativeRelevant / (k + 1);
		}
	}

	return sumPrecision / totalRelevant;
}
