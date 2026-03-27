import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { classifyClaims, errorResult, extractClaims, extractContexts } from "./utils.js";

/**
 * Measures how completely the retrieved context covers the ground truth answer.
 * Decomposes the ground truth into atomic claims and checks if each can be
 * inferred from the retrieved context.
 *
 * Inputs:
 * - expected: ground truth answer (decomposed into claims)
 * - input: the user question (used for context in LLM calls)
 * - context.contexts: string[] of retrieved document chunks
 *
 * Algorithm:
 * 1. Extract atomic claims from the ground truth (1 LLM call)
 * 2. Classify each claim as supported/unsupported by context (1 LLM call)
 * 3. Score = supported_claims / total_claims
 *
 * LLM calls: 2 per scored test case.
 */
export class ContextRecallScorer implements IScorer {
	readonly id = "context-recall";
	readonly name = "Context Recall";
	readonly type: ScorerType = "context-recall";
	private provider: IProvider;

	constructor(provider: IProvider) {
		this.provider = provider;
	}

	async score(
		_output: string,
		expected: string,
		_input?: string,
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

		if (!expected || expected.trim().length === 0) {
			return errorResult(this.id, this.name, this.type, "No ground truth (expected) provided");
		}

		// Step 1: Decompose ground truth into atomic claims
		const claims = await extractClaims(this.provider, expected);
		if (!claims) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				"Failed to extract claims from ground truth",
			);
		}
		if (claims.length === 0) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 1,
				reason: "No claims extracted from ground truth (vacuously complete)",
				metadata: { claims: [], verdicts: [] },
			};
		}

		// Step 2: Classify each claim against the retrieved context
		const verdicts = await classifyClaims(this.provider, claims, contexts);
		if (!verdicts) {
			return errorResult(
				this.id,
				this.name,
				this.type,
				"Failed to classify claims against context",
			);
		}

		const supported = verdicts.filter((v) => v.supported).length;
		const total = claims.length;
		const value = total > 0 ? supported / total : 0;

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			reason: `${supported}/${total} ground truth claims supported by context`,
			metadata: {
				claims,
				verdicts: verdicts.map((v, i) => ({ claim: claims[i], ...v })),
			},
		};
	}
}
