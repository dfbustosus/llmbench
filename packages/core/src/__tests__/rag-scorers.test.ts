import type { IProvider, ProviderResponse } from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import { createScorer } from "../scorers/index.js";
import { AnswerRelevancyScorer } from "../scorers/rag/answer-relevancy.js";
import { ContextPrecisionScorer } from "../scorers/rag/context-precision.js";
import { ContextRecallScorer } from "../scorers/rag/context-recall.js";
import { FaithfulnessScorer } from "../scorers/rag/faithfulness.js";
import { extractContexts, parseJsonResponse } from "../scorers/rag/utils.js";

function createMockProvider(responses: string[]): IProvider {
	let callIndex = 0;
	return {
		type: "custom",
		name: "mock-judge",
		model: "mock-model",
		generate: vi.fn().mockImplementation(
			async (): Promise<ProviderResponse> => ({
				output: responses[callIndex++] ?? "{}",
				tokenUsage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
				latencyMs: 50,
			}),
		),
	} as unknown as IProvider;
}

function createErrorProvider(): IProvider {
	return {
		type: "custom",
		name: "error-provider",
		model: "error-model",
		generate: vi.fn().mockImplementation(
			async (): Promise<ProviderResponse> => ({
				output: "",
				error: "API connection failed",
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				latencyMs: 0,
			}),
		),
	} as unknown as IProvider;
}

const ragContext = {
	contexts: [
		"Paris is the capital of France.",
		"The Eiffel Tower is located in Paris.",
		"France is a country in Western Europe.",
	],
};

// ---------- Shared utilities ----------

describe("extractContexts", () => {
	it("should return empty array for undefined context", () => {
		expect(extractContexts(undefined)).toEqual([]);
	});

	it("should return empty array when contexts key is missing", () => {
		expect(extractContexts({ other: "data" })).toEqual([]);
	});

	it("should return empty array when contexts is not an array", () => {
		expect(extractContexts({ contexts: "not-an-array" })).toEqual([]);
	});

	it("should extract string array from context.contexts", () => {
		const result = extractContexts({ contexts: ["doc1", "doc2"] });
		expect(result).toEqual(["doc1", "doc2"]);
	});

	it("should filter out non-string elements", () => {
		const result = extractContexts({ contexts: ["doc1", 42, null, "doc2"] });
		expect(result).toEqual(["doc1", "doc2"]);
	});

	it("should filter out empty and whitespace-only strings", () => {
		const result = extractContexts({ contexts: ["doc1", "", "  ", "doc2"] });
		expect(result).toEqual(["doc1", "doc2"]);
	});
});

describe("parseJsonResponse", () => {
	it("should parse valid JSON", () => {
		const result = parseJsonResponse('{"score": 0.5}', (p) =>
			p && typeof p === "object" && "score" in p ? (p as { score: number }) : null,
		);
		expect(result).toEqual({ score: 0.5 });
	});

	it("should strip markdown fences", () => {
		const result = parseJsonResponse('```json\n{"score": 0.8}\n```', (p) =>
			p && typeof p === "object" && "score" in p ? (p as { score: number }) : null,
		);
		expect(result).toEqual({ score: 0.8 });
	});

	it("should return null for invalid JSON", () => {
		const result = parseJsonResponse("not json", (p) => p as string);
		expect(result).toBeNull();
	});

	it("should return null when validator rejects", () => {
		const result = parseJsonResponse('{"wrong": true}', (p) =>
			p && typeof p === "object" && "score" in p ? (p as { score: number }) : null,
		);
		expect(result).toBeNull();
	});
});

// ---------- Context Precision ----------

describe("ContextPrecisionScorer", () => {
	it("should return 1.0 when all contexts are useful", async () => {
		const provider = createMockProvider([
			JSON.stringify({
				verdicts: [
					{ useful: true, reason: "relevant" },
					{ useful: true, reason: "relevant" },
					{ useful: true, reason: "relevant" },
				],
			}),
		]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score(
			"",
			"Paris is the capital of France",
			"What is the capital of France?",
			ragContext,
		);
		expect(result.value).toBe(1);
	});

	it("should return 0 when no contexts are useful", async () => {
		const provider = createMockProvider([
			JSON.stringify({
				verdicts: [
					{ useful: false, reason: "irrelevant" },
					{ useful: false, reason: "irrelevant" },
					{ useful: false, reason: "irrelevant" },
				],
			}),
		]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "What is the capital?", ragContext);
		expect(result.value).toBe(0);
	});

	it("should compute correct Average Precision for mixed verdicts", async () => {
		// Verdicts: [true, false, true]
		// AP = (1/2) * (1/1 + 2/3) = (1/2) * (1 + 0.6667) = 0.8333
		const provider = createMockProvider([
			JSON.stringify({
				verdicts: [
					{ useful: true, reason: "relevant" },
					{ useful: false, reason: "irrelevant" },
					{ useful: true, reason: "relevant" },
				],
			}),
		]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "Capital?", ragContext);
		expect(result.value).toBeCloseTo(0.8333, 3);
	});

	it("should return 0 with reason when no contexts provided", async () => {
		const provider = createMockProvider([]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "Capital?", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No 'contexts' array");
	});

	it("should return 0 on LLM error", async () => {
		const provider = createErrorProvider();
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "Capital?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("LLM error");
	});

	it("should handle LLM returning fewer verdicts than chunks (pads with false)", async () => {
		// 3 chunks but LLM only returns 1 verdict [true]
		// Padded to [true, false, false] => AP = 1/1 * 1/1 = 1.0 / 1 = 1.0
		// But only 1 out of 3 chunks marked useful
		const provider = createMockProvider([
			JSON.stringify({
				verdicts: [{ useful: true, reason: "relevant" }],
			}),
		]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "Capital?", ragContext);
		expect(result.value).toBe(1); // AP with [true, false, false]: (1/1)/1 = 1.0
		expect(result.metadata?.verdicts).toHaveLength(3);
	});

	it("should return 0 on malformed JSON response", async () => {
		const provider = createMockProvider(["not valid json at all"]);
		const scorer = new ContextPrecisionScorer(provider);
		const result = await scorer.score("", "Paris", "Capital?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to parse");
	});
});

// ---------- Context Recall ----------

describe("ContextRecallScorer", () => {
	it("should return 1.0 when all claims are supported", async () => {
		const provider = createMockProvider([
			// extractClaims response
			JSON.stringify({ claims: ["Paris is the capital", "France is in Europe"] }),
			// classifyClaims response
			JSON.stringify({
				verdicts: [
					{ supported: true, reason: "found in context" },
					{ supported: true, reason: "found in context" },
				],
			}),
		]);
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score(
			"",
			"Paris is the capital of France in Europe",
			"Capital?",
			ragContext,
		);
		expect(result.value).toBe(1);
	});

	it("should return 0 when no claims are supported", async () => {
		const provider = createMockProvider([
			JSON.stringify({ claims: ["Tokyo is the capital", "Japan is in Asia"] }),
			JSON.stringify({
				verdicts: [
					{ supported: false, reason: "not in context" },
					{ supported: false, reason: "not in context" },
				],
			}),
		]);
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score("", "Tokyo is the capital of Japan", "Capital?", ragContext);
		expect(result.value).toBe(0);
	});

	it("should return 0.5 when half the claims are supported", async () => {
		const provider = createMockProvider([
			JSON.stringify({ claims: ["Paris is the capital", "Population is 2 million"] }),
			JSON.stringify({
				verdicts: [
					{ supported: true, reason: "found" },
					{ supported: false, reason: "not found" },
				],
			}),
		]);
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score(
			"",
			"Paris is the capital with 2 million people",
			"Capital?",
			ragContext,
		);
		expect(result.value).toBe(0.5);
	});

	it("should return 0 when no contexts provided", async () => {
		const provider = createMockProvider([]);
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score("", "Some expected output", "Question?", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No 'contexts' array");
	});

	it("should return 1.0 when zero claims extracted (vacuously true)", async () => {
		const provider = createMockProvider([JSON.stringify({ claims: [] })]);
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score("", "Expected", "Question?", ragContext);
		expect(result.value).toBe(1);
		expect(result.reason).toContain("vacuously");
	});

	it("should return 0 on LLM error during claim extraction", async () => {
		const provider = createErrorProvider();
		const scorer = new ContextRecallScorer(provider);
		const result = await scorer.score("", "Expected", "Question?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to extract claims");
	});
});

// ---------- Faithfulness ----------

describe("FaithfulnessScorer", () => {
	it("should return 1.0 when all answer claims are supported", async () => {
		const provider = createMockProvider([
			JSON.stringify({ claims: ["Paris is the capital of France", "Eiffel Tower is in Paris"] }),
			JSON.stringify({
				verdicts: [
					{ supported: true, reason: "stated in context" },
					{ supported: true, reason: "stated in context" },
				],
			}),
		]);
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score(
			"Paris is the capital of France and has the Eiffel Tower",
			"",
			"Tell me about Paris",
			ragContext,
		);
		expect(result.value).toBe(1);
	});

	it("should return 0 when no answer claims are supported (hallucination)", async () => {
		const provider = createMockProvider([
			JSON.stringify({ claims: ["Berlin is the capital", "Germany borders France"] }),
			JSON.stringify({
				verdicts: [
					{ supported: false, reason: "not in context" },
					{ supported: false, reason: "not in context" },
				],
			}),
		]);
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score(
			"Berlin is the capital of Germany",
			"",
			"Capital?",
			ragContext,
		);
		expect(result.value).toBe(0);
	});

	it("should return partial score for partial support", async () => {
		const provider = createMockProvider([
			JSON.stringify({ claims: ["Paris is the capital", "It has 12 million people"] }),
			JSON.stringify({
				verdicts: [
					{ supported: true, reason: "correct" },
					{ supported: false, reason: "not in context" },
				],
			}),
		]);
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score(
			"Paris is the capital with 12 million people",
			"",
			"Capital?",
			ragContext,
		);
		expect(result.value).toBe(0.5);
	});

	it("should return 0 when no contexts provided", async () => {
		const provider = createMockProvider([]);
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score("Some output", "", "Question?", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No 'contexts' array");
	});

	it("should return 0 when output is empty", async () => {
		const provider = createMockProvider([]);
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score("", "", "Question?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No output");
	});

	it("should return 0 on LLM error", async () => {
		const provider = createErrorProvider();
		const scorer = new FaithfulnessScorer(provider);
		const result = await scorer.score("Some answer", "", "Question?", ragContext);
		expect(result.value).toBe(0);
	});
});

// ---------- Answer Relevancy ----------

describe("AnswerRelevancyScorer", () => {
	it("should return high score when generated questions are similar to original", async () => {
		const provider = createMockProvider([
			JSON.stringify({
				questions: [
					"What is the capital of France?",
					"Which city is the capital of France?",
					"What is France's capital city?",
				],
			}),
		]);
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score(
			"The capital of France is Paris.",
			"",
			"What is the capital of France?",
		);
		expect(result.value).toBeGreaterThan(0.5);
	});

	it("should return low score when generated questions are unrelated", async () => {
		const provider = createMockProvider([
			JSON.stringify({
				questions: [
					"How does photosynthesis work?",
					"What is the boiling point of water?",
					"Who invented the telephone?",
				],
			}),
		]);
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score(
			"The capital of France is Paris.",
			"",
			"What is the capital of France?",
		);
		expect(result.value).toBeLessThan(0.3);
	});

	it("should return 0 when LLM returns invalid JSON", async () => {
		const provider = createMockProvider(["this is not json"]);
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score("Paris", "", "Capital of France?");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to parse");
	});

	it("should return 0 when input is missing", async () => {
		const provider = createMockProvider([]);
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score("Paris", "", undefined);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No input question");
	});

	it("should return 0 when output is empty", async () => {
		const provider = createMockProvider([]);
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score("", "", "What is the capital?");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No output");
	});

	it("should respect custom numQuestions option", async () => {
		const provider = createMockProvider([
			JSON.stringify({
				questions: ["Q1?", "Q2?"],
			}),
		]);
		const scorer = new AnswerRelevancyScorer(provider, { numQuestions: 2 });
		const result = await scorer.score("Some answer about Paris.", "", "Tell me about Paris?");
		expect(result.metadata?.generatedQuestions).toHaveLength(2);
	});

	it("should return 0 on LLM error", async () => {
		const provider = createErrorProvider();
		const scorer = new AnswerRelevancyScorer(provider);
		const result = await scorer.score("Paris is the capital", "", "Capital?");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("LLM error");
	});
});

// ---------- Provider throwing exception ----------

describe("RAG scorers handle provider exceptions", () => {
	function createThrowingProvider(): IProvider {
		return {
			type: "custom",
			name: "throwing-provider",
			model: "throw-model",
			generate: vi.fn().mockRejectedValue(new Error("Network timeout")),
		} as unknown as IProvider;
	}

	it("ContextPrecisionScorer returns 0 on provider exception", async () => {
		const scorer = new ContextPrecisionScorer(createThrowingProvider());
		const result = await scorer.score("", "Paris", "Capital?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Context precision failed");
	});

	it("ContextRecallScorer returns 0 on provider exception", async () => {
		const scorer = new ContextRecallScorer(createThrowingProvider());
		const result = await scorer.score("", "Expected answer", "Question?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to extract claims");
	});

	it("FaithfulnessScorer returns 0 on provider exception", async () => {
		const scorer = new FaithfulnessScorer(createThrowingProvider());
		const result = await scorer.score("Some answer", "", "Question?", ragContext);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to extract claims");
	});

	it("AnswerRelevancyScorer returns 0 on provider exception", async () => {
		const scorer = new AnswerRelevancyScorer(createThrowingProvider());
		const result = await scorer.score("Some answer", "", "Question?");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Answer relevancy failed");
	});
});

// ---------- Factory integration ----------

describe("createScorer with RAG types", () => {
	const mockProvider = createMockProvider([]);

	it("should create context-precision scorer with provider", () => {
		const scorer = createScorer(
			{ id: "cp", name: "CP", type: "context-precision" },
			{ provider: mockProvider },
		);
		expect(scorer.type).toBe("context-precision");
	});

	it("should create context-recall scorer with provider", () => {
		const scorer = createScorer(
			{ id: "cr", name: "CR", type: "context-recall" },
			{ provider: mockProvider },
		);
		expect(scorer.type).toBe("context-recall");
	});

	it("should create faithfulness scorer with provider", () => {
		const scorer = createScorer(
			{ id: "f", name: "F", type: "faithfulness" },
			{ provider: mockProvider },
		);
		expect(scorer.type).toBe("faithfulness");
	});

	it("should create answer-relevancy scorer with provider", () => {
		const scorer = createScorer(
			{ id: "ar", name: "AR", type: "answer-relevancy" },
			{ provider: mockProvider },
		);
		expect(scorer.type).toBe("answer-relevancy");
	});

	it("should throw when context-precision created without provider", () => {
		expect(() => createScorer({ id: "cp", name: "CP", type: "context-precision" })).toThrow(
			"requires a provider",
		);
	});

	it("should throw when faithfulness created without provider", () => {
		expect(() => createScorer({ id: "f", name: "F", type: "faithfulness" })).toThrow(
			"requires a provider",
		);
	});
});
