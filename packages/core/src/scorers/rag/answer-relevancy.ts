import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { tokenize } from "../semantic/tokenizer.js";
import { cosineSimilarity, errorResult, parseJsonResponse, sanitizeForPrompt } from "./utils.js";

const DEFAULT_NUM_QUESTIONS = 3;

/**
 * Evaluates how well the generated answer addresses the original question.
 * Generates synthetic questions from the answer and measures their similarity
 * to the original question via word-level cosine similarity.
 *
 * Inputs:
 * - output: the LLM-generated answer
 * - input: the original user question
 *
 * Algorithm:
 * 1. LLM generates N questions that the answer would address (1 LLM call)
 * 2. Compute word-level cosine similarity between each generated question and the original
 * 3. Score = average similarity across all generated questions
 *
 * LLM calls: 1 per scored test case.
 */
export class AnswerRelevancyScorer implements IScorer {
	readonly id = "answer-relevancy";
	readonly name = "Answer Relevancy";
	readonly type: ScorerType = "answer-relevancy";
	private provider: IProvider;
	private numQuestions: number;

	constructor(provider: IProvider, options?: { numQuestions?: number }) {
		this.provider = provider;
		this.numQuestions = options?.numQuestions ?? DEFAULT_NUM_QUESTIONS;
	}

	async score(output: string, _expected: string, input?: string): Promise<ScoreResult> {
		if (!input || input.trim().length === 0) {
			return errorResult(this.id, this.name, this.type, "No input question provided");
		}

		if (!output || output.trim().length === 0) {
			return errorResult(this.id, this.name, this.type, "No output to evaluate");
		}

		const prompt = `Given the following answer, generate exactly ${this.numQuestions} questions that this answer would appropriately address. The questions should be diverse but directly related to the content of the answer.

Answer: ${sanitizeForPrompt(output)}

Respond with a JSON object:
{
  "questions": ["question 1", "question 2", ...]
}

Only respond with valid JSON, nothing else.`;

		try {
			const response = await this.provider.generate(prompt);

			if (response.error) {
				return errorResult(this.id, this.name, this.type, `LLM error: ${response.error}`);
			}

			const questions = parseJsonResponse(response.output, (parsed) => {
				if (
					parsed &&
					typeof parsed === "object" &&
					"questions" in parsed &&
					Array.isArray((parsed as Record<string, unknown>).questions)
				) {
					return (parsed as { questions: unknown[] }).questions.filter(
						(q): q is string => typeof q === "string" && q.trim().length > 0,
					);
				}
				return null;
			});

			if (!questions || questions.length === 0) {
				return errorResult(
					this.id,
					this.name,
					this.type,
					`Failed to parse generated questions: ${response.output.slice(0, 200)}`,
				);
			}

			// Compute word-level cosine similarity between each generated question and the original
			const originalTokens = tokenize(input);
			const similarities = questions.map((q) => {
				const genTokens = tokenize(q);
				const allTokens = new Set([...originalTokens, ...genTokens]);
				const origVec = vectorize(originalTokens, allTokens);
				const genVec = vectorize(genTokens, allTokens);
				return cosineSimilarity(origVec, genVec);
			});

			const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
			const value = Math.max(0, Math.min(1, avgSimilarity));

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value,
				rawValue: avgSimilarity,
				reason: `Average question similarity: ${value.toFixed(4)} (${questions.length} questions generated)`,
				metadata: {
					generatedQuestions: questions,
					similarities,
				},
			};
		} catch (error) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				`Answer relevancy failed: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
}

function vectorize(tokens: string[], vocabulary: Set<string>): number[] {
	const freq = new Map<string, number>();
	for (const t of tokens) {
		freq.set(t, (freq.get(t) || 0) + 1);
	}
	return Array.from(vocabulary).map((word) => freq.get(word) || 0);
}
