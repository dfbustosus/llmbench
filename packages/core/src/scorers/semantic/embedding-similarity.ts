import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

export type EmbedFn = (text: string) => Promise<number[]>;

export class EmbeddingSimilarityScorer implements IScorer {
	readonly id = "embedding-similarity";
	readonly name = "Embedding Similarity";
	readonly type: ScorerType = "embedding-similarity";
	private embedFn: EmbedFn;

	constructor(embedFn: EmbedFn) {
		this.embedFn = embedFn;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		const [outputVec, expectedVec] = await Promise.all([
			this.embedFn(output),
			this.embedFn(expected),
		]);

		if (outputVec.length !== expectedVec.length) {
			return this.result(0, 0, `Dimension mismatch: ${outputVec.length} vs ${expectedVec.length}`);
		}

		const similarity = this.cosineSim(outputVec, expectedVec);

		return this.result(
			Math.max(0, Math.min(1, similarity)),
			outputVec.length,
			`Embedding similarity: ${similarity.toFixed(4)}`,
		);
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

	private result(value: number, dimensions: number, reason: string): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			rawValue: value,
			reason,
			metadata: { dimensions },
		};
	}
}
