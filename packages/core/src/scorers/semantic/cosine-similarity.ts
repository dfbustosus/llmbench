import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { tokenize } from "./tokenizer.js";

export class CosineSimilarityScorer implements IScorer {
	readonly id = "cosine-similarity";
	readonly name = "Cosine Similarity";
	readonly type: ScorerType = "cosine-similarity";

	async score(output: string, expected: string): Promise<ScoreResult> {
		const outputTokens = tokenize(output);
		const expectedTokens = tokenize(expected);

		const allTokens = new Set([...outputTokens, ...expectedTokens]);
		const outputVec = this.vectorize(outputTokens, allTokens);
		const expectedVec = this.vectorize(expectedTokens, allTokens);

		const similarity = this.cosineSim(outputVec, expectedVec);

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: Math.max(0, Math.min(1, similarity)),
			rawValue: similarity,
			reason: `Cosine similarity: ${similarity.toFixed(4)}`,
		};
	}

	private vectorize(tokens: string[], vocabulary: Set<string>): number[] {
		const freq = new Map<string, number>();
		for (const t of tokens) {
			freq.set(t, (freq.get(t) || 0) + 1);
		}
		return Array.from(vocabulary).map((word) => freq.get(word) || 0);
	}

	private cosineSim(a: number[], b: number[]): number {
		let dot = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			dot += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}
		const denom = Math.sqrt(normA) * Math.sqrt(normB);
		return denom === 0 ? 0 : dot / denom;
	}
}
