import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import { countNgrams, getNgrams, tokenize } from "./tokenizer.js";

export interface RougeOptions {
	variant?: "rouge-l" | "rouge-n";
	n?: number;
}

export class RougeScorer implements IScorer {
	readonly id = "rouge";
	readonly name = "ROUGE";
	readonly type: ScorerType = "rouge";
	private variant: "rouge-l" | "rouge-n";
	private n: number;

	constructor(options?: RougeOptions) {
		this.variant = options?.variant ?? "rouge-l";
		this.n = options?.n ?? 1;
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		const outTokens = tokenize(output);
		const refTokens = tokenize(expected);

		if (outTokens.length === 0 && refTokens.length === 0) {
			return this.result(1, 1, 1, 1);
		}
		if (outTokens.length === 0 || refTokens.length === 0) {
			return this.result(0, 0, 0, 0);
		}

		if (this.variant === "rouge-l") {
			return this.rougeL(outTokens, refTokens);
		}
		return this.rougeN(outTokens, refTokens);
	}

	private rougeL(outTokens: string[], refTokens: string[]): ScoreResult {
		const lcsLen = this.lcsLength(outTokens, refTokens);
		const precision = lcsLen / outTokens.length;
		const recall = lcsLen / refTokens.length;
		const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

		return this.result(f1, precision, recall, f1);
	}

	private rougeN(outTokens: string[], refTokens: string[]): ScoreResult {
		const outNgrams = getNgrams(outTokens, this.n);
		const refNgrams = getNgrams(refTokens, this.n);

		if (outNgrams.length === 0 && refNgrams.length === 0) {
			return this.result(1, 1, 1, 1);
		}
		if (outNgrams.length === 0 || refNgrams.length === 0) {
			return this.result(0, 0, 0, 0);
		}

		const outCounts = countNgrams(outNgrams);
		const refCounts = countNgrams(refNgrams);

		let overlap = 0;
		for (const [ngram, count] of refCounts) {
			overlap += Math.min(count, outCounts.get(ngram) || 0);
		}

		const precision = overlap / outNgrams.length;
		const recall = overlap / refNgrams.length;
		const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

		return this.result(f1, precision, recall, f1);
	}

	/** Two-row DP for LCS length. */
	private lcsLength(a: string[], b: string[]): number {
		const m = a.length;
		const n = b.length;
		let prev = new Array<number>(n + 1).fill(0);
		let curr = new Array<number>(n + 1).fill(0);

		for (let i = 1; i <= m; i++) {
			for (let j = 1; j <= n; j++) {
				if (a[i - 1] === b[j - 1]) {
					curr[j] = prev[j - 1] + 1;
				} else {
					curr[j] = Math.max(prev[j], curr[j - 1]);
				}
			}
			[prev, curr] = [curr, prev];
			curr.fill(0);
		}

		return prev[n];
	}

	private result(value: number, precision: number, recall: number, f1: number): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: Math.max(0, Math.min(1, value)),
			rawValue: value,
			reason: `ROUGE (${this.variant}) F1: ${f1.toFixed(4)}`,
			metadata: { variant: this.variant, precision, recall, f1 },
		};
	}
}
