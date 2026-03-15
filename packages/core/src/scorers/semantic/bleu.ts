import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { countNgrams, getNgrams, tokenize } from "./tokenizer.js";

export interface BleuOptions {
	maxN?: number;
	weights?: number[];
}

export class BleuScorer implements IScorer {
	readonly id = "bleu";
	readonly name = "BLEU";
	readonly type: ScorerType = "bleu";
	private maxN: number;
	private weights: number[];

	constructor(options?: BleuOptions) {
		this.maxN = options?.maxN ?? 4;
		this.weights = options?.weights ?? Array(this.maxN).fill(1 / this.maxN);
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		const candidateTokens = tokenize(output);
		const referenceTokens = tokenize(expected);

		if (candidateTokens.length === 0) {
			return this.result(
				0,
				0,
				Array(this.maxN).fill(0),
				candidateTokens.length,
				referenceTokens.length,
			);
		}

		// Brevity penalty
		const bp =
			candidateTokens.length >= referenceTokens.length
				? 1
				: Math.exp(1 - referenceTokens.length / candidateTokens.length);

		// Modified n-gram precisions
		const precisions: number[] = [];
		let logSum = 0;
		let allPositive = true;

		for (let n = 1; n <= this.maxN; n++) {
			const candNgrams = getNgrams(candidateTokens, n);
			const refNgrams = getNgrams(referenceTokens, n);

			if (candNgrams.length === 0) {
				precisions.push(0);
				allPositive = false;
				continue;
			}

			const candCounts = countNgrams(candNgrams);
			const refCounts = countNgrams(refNgrams);

			let clipped = 0;
			for (const [ngram, count] of candCounts) {
				clipped += Math.min(count, refCounts.get(ngram) || 0);
			}

			const precision = clipped / candNgrams.length;
			precisions.push(precision);

			if (precision === 0) {
				allPositive = false;
			} else {
				logSum += this.weights[n - 1] * Math.log(precision);
			}
		}

		const value = allPositive ? bp * Math.exp(logSum) : 0;

		return this.result(value, bp, precisions, candidateTokens.length, referenceTokens.length);
	}

	private result(
		value: number,
		brevityPenalty: number,
		ngramPrecisions: number[],
		candidateLength: number,
		referenceLength: number,
	): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: Math.max(0, Math.min(1, value)),
			rawValue: value,
			reason: `BLEU score: ${value.toFixed(4)}`,
			metadata: { brevityPenalty, ngramPrecisions, candidateLength, referenceLength },
		};
	}
}
