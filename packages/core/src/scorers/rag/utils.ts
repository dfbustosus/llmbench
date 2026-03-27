import type { IProvider, ScoreResult, ScorerType } from "@llmbench/types";

const MAX_CONTEXT_CHUNKS = 20;
const MAX_CLAIMS = 50;

/**
 * Extracts the retrieved context documents from the test case context field.
 * Convention: users store retrieved docs as `context.contexts: string[]`.
 */
export function extractContexts(context?: Record<string, unknown>): string[] {
	if (!context || !Array.isArray(context.contexts)) {
		return [];
	}
	const raw = context.contexts as unknown[];
	const strings = raw.filter((c): c is string => typeof c === "string" && c.trim().length > 0);
	return strings.slice(0, MAX_CONTEXT_CHUNKS);
}

/**
 * Escapes template-like sequences so they don't interfere with prompt
 * interpolation (matches the pattern in llm-judge.ts).
 */
export function sanitizeForPrompt(text: string): string {
	return text.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
}

/**
 * Parses a JSON response from an LLM, stripping markdown code fences if present.
 * Returns null on any parse failure.
 */
export function parseJsonResponse<T>(
	raw: string,
	validator: (parsed: unknown) => T | null,
): T | null {
	try {
		let cleaned = raw.trim();
		// Strip markdown code fences (```json ... ``` or ``` ... ```)
		const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
		if (fenceMatch) {
			cleaned = fenceMatch[1].trim();
		}
		const parsed = JSON.parse(cleaned);
		return validator(parsed);
	} catch {
		return null;
	}
}

/**
 * Builds a ScoreResult for error/edge-case paths (score = 0).
 */
export function errorResult(
	id: string,
	name: string,
	type: ScorerType,
	reason: string,
): ScoreResult {
	return {
		scorerId: id,
		scorerName: name,
		scorerType: type,
		value: 0,
		reason,
	};
}

/**
 * Uses an LLM to decompose a text into a list of atomic factual claims.
 * Shared by Context Recall (decomposes ground truth) and Faithfulness (decomposes answer).
 */
export async function extractClaims(provider: IProvider, text: string): Promise<string[] | null> {
	const prompt = `Break the following text into a list of independent, atomic factual claims. Each claim should be a single, verifiable statement.

Text:
${sanitizeForPrompt(text)}

Respond with a JSON object:
{
  "claims": ["claim 1", "claim 2", ...]
}

Only respond with valid JSON, nothing else.`;

	try {
		const response = await provider.generate(prompt);
		if (response.error) return null;

		return parseJsonResponse(response.output, (parsed) => {
			if (
				parsed &&
				typeof parsed === "object" &&
				"claims" in parsed &&
				Array.isArray((parsed as Record<string, unknown>).claims)
			) {
				const claims = (parsed as { claims: unknown[] }).claims
					.filter((c): c is string => typeof c === "string")
					.slice(0, MAX_CLAIMS);
				return claims;
			}
			return null;
		});
	} catch {
		return null;
	}
}

/**
 * Uses an LLM to classify whether each claim is supported by the given context.
 * Returns an array of booleans parallel to the claims array.
 * Shared by Context Recall and Faithfulness.
 */
export async function classifyClaims(
	provider: IProvider,
	claims: string[],
	contexts: string[],
): Promise<{ supported: boolean; reason: string }[] | null> {
	const numberedClaims = claims.map((c, i) => `${i + 1}. ${sanitizeForPrompt(c)}`).join("\n");
	const joinedContexts = contexts.map((c, i) => `[${i + 1}] ${sanitizeForPrompt(c)}`).join("\n\n");

	const prompt = `You are checking whether each claim can be inferred from the provided context.

Context:
${joinedContexts}

Claims:
${numberedClaims}

For each claim, determine if it can be inferred from the context above.

Respond with a JSON object:
{
  "verdicts": [{"supported": true, "reason": "brief explanation"}, ...]
}

You must provide exactly ${claims.length} verdicts, one per claim, in order.
Only respond with valid JSON, nothing else.`;

	try {
		const response = await provider.generate(prompt);
		if (response.error) return null;

		return parseJsonResponse(response.output, (parsed) => {
			if (
				parsed &&
				typeof parsed === "object" &&
				"verdicts" in parsed &&
				Array.isArray((parsed as Record<string, unknown>).verdicts)
			) {
				const verdicts = (parsed as { verdicts: unknown[] }).verdicts;
				return verdicts.map((v) => {
					if (v && typeof v === "object" && "supported" in v) {
						const obj = v as { supported: unknown; reason?: unknown };
						return {
							supported: Boolean(obj.supported),
							reason: typeof obj.reason === "string" ? obj.reason : "",
						};
					}
					return { supported: false, reason: "Invalid verdict format" };
				});
			}
			return null;
		});
	} catch {
		return null;
	}
}

/**
 * Cosine similarity between two numeric vectors.
 * Used by Answer Relevancy to compare question embeddings.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
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
