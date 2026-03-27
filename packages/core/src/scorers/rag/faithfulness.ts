import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { classifyClaims, errorResult, extractClaims, extractContexts } from "./utils.js";

/**
 * Measures factual consistency between the generated answer and the retrieved context.
 * Quantifies hallucination rate: what fraction of answer claims are actually supported
 * by the retrieved documents.
 *
 * Inputs:
 * - output: the LLM-generated answer (decomposed into claims)
 * - context.contexts: string[] of retrieved document chunks
 *
 * Algorithm:
 * 1. Extract atomic claims from the answer (1 LLM call)
 * 2. Classify each claim as supported/unsupported by context (1 LLM call)
 * 3. Score = supported_claims / total_claims
 *
 * LLM calls: 2 per scored test case.
 */
export class FaithfulnessScorer implements IScorer {
	readonly id = "faithfulness";
	readonly name = "Faithfulness";
	readonly type: ScorerType = "faithfulness";
	private provider: IProvider;

	constructor(provider: IProvider) {
		this.provider = provider;
	}

	async score(
		output: string,
		_expected: string,
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

		if (!output || output.trim().length === 0) {
			return errorResult(this.id, this.name, this.type, "No output to evaluate");
		}

		// Step 1: Decompose the answer into atomic claims
		const claims = await extractClaims(this.provider, output);
		if (!claims) {
			return errorResult(this.id, this.name, this.type, "Failed to extract claims from answer");
		}
		if (claims.length === 0) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 1,
				reason: "No claims extracted from answer (vacuously faithful)",
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
			reason: `${supported}/${total} answer claims supported by context`,
			metadata: {
				claims,
				verdicts: verdicts.map((v, i) => ({ claim: claims[i], ...v })),
			},
		};
	}
}
