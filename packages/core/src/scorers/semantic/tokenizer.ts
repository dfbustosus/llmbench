/**
 * Shared tokenizer utilities for semantic scorers.
 */

export function tokenize(text: string): string[] {
	return text.toLowerCase().split(/\W+/).filter(Boolean);
}

export function getNgrams(tokens: string[], n: number): string[] {
	if (n < 1 || tokens.length < n) return [];
	const ngrams: string[] = [];
	for (let i = 0; i <= tokens.length - n; i++) {
		ngrams.push(tokens.slice(i, i + n).join(" "));
	}
	return ngrams;
}

export function countNgrams(ngrams: string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const ng of ngrams) {
		counts.set(ng, (counts.get(ng) || 0) + 1);
	}
	return counts;
}
