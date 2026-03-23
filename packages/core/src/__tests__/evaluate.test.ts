import type { EvalEvent, ProviderConfig } from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import type { CustomGenerateFn } from "../providers/custom-provider.js";
import { evaluate, evaluateQuick } from "../sdk/evaluate.js";

// ── Helper: canned custom provider ──────────────────────────────────

const CANNED_ANSWERS: Record<string, string> = {
	"What is the capital of France?": "Paris",
	"What is 2 + 2?": "4",
};

const cannedGenerateFn: CustomGenerateFn = async (input) => {
	const text = typeof input === "string" ? input : input.map((m) => m.content).join(" ");
	const output = CANNED_ANSWERS[text] ?? "unknown";
	return {
		output,
		latencyMs: 10,
		tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
	};
};

function makeCustomConfig(name: string): ProviderConfig {
	return { type: "custom", name, model: `fake-${name.toLowerCase()}` };
}

// ── Tests ────────────────────────────────────────────────────────────

describe("evaluate() SDK", () => {
	it("should run a basic e2e evaluation with correct scores", async () => {
		const result = await evaluate({
			testCases: [
				{ input: "What is the capital of France?", expected: "Paris" },
				{ input: "What is 2 + 2?", expected: "4" },
			],
			providers: [makeCustomConfig("TestLLM")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.status).toBe("completed");
		expect(result.results).toHaveLength(2);
		expect(result.summary.completedCases).toBe(2);
		expect(result.summary.failedCases).toBe(0);
		expect(result.summary.durationMs).toBeGreaterThanOrEqual(0);

		// Both answers are correct -> exact match = 1.0
		for (const r of result.results) {
			const exactScore = r.scores.find((s) => s.scorerName === "Exact Match");
			expect(exactScore).toBeDefined();
			expect(exactScore?.value).toBe(1);
		}

		expect(result.scorerAverages["Exact Match"]).toBe(1);
	});

	it("should handle multiple providers", async () => {
		const secondFn: CustomGenerateFn = async () => ({
			output: "wrong",
			latencyMs: 5,
			tokenUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
		});

		const result = await evaluate({
			testCases: [
				{ input: "What is the capital of France?", expected: "Paris" },
				{ input: "What is 2 + 2?", expected: "4" },
			],
			providers: [makeCustomConfig("GoodLLM"), makeCustomConfig("BadLLM")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([
				["GoodLLM", cannedGenerateFn],
				["BadLLM", secondFn],
			]),
		});

		expect(result.status).toBe("completed");
		// 2 test cases x 2 providers = 4 results
		expect(result.results).toHaveLength(4);
		expect(result.summary.totalCases).toBe(4);
	});

	it("should handle multiple scorers", async () => {
		const result = await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [makeCustomConfig("TestLLM")],
			scorers: [
				{ id: "exact-match", name: "Exact Match", type: "exact-match" },
				{ id: "contains", name: "Contains", type: "contains" },
			],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.results).toHaveLength(1);
		// 2 scorers per result
		expect(result.results[0].scores).toHaveLength(2);

		const exactScore = result.results[0].scores.find((s) => s.scorerName === "Exact Match");
		const containsScore = result.results[0].scores.find((s) => s.scorerName === "Contains");
		expect(exactScore?.value).toBe(1);
		expect(containsScore?.value).toBe(1);
	});

	it("should handle a failing provider", async () => {
		const failingFn: CustomGenerateFn = async () => ({
			output: "",
			latencyMs: 0,
			tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
			error: "API error",
		});

		const result = await evaluate({
			testCases: [{ input: "test", expected: "test" }],
			providers: [makeCustomConfig("FailLLM")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["FailLLM", failingFn]]),
			maxRetries: 0,
		});

		expect(result.status).toBe("failed");
		expect(result.summary.failedCases).toBeGreaterThan(0);
		expect(result.results[0].result.error).toBe("API error");
	});

	it("should invoke onEvent callback with expected events", async () => {
		const events: EvalEvent[] = [];
		const spy = vi.fn((e: EvalEvent) => events.push(e));

		await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [makeCustomConfig("TestLLM")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
			onEvent: spy,
		});

		expect(spy).toHaveBeenCalled();
		const eventTypes = events.map((e) => e.type);
		expect(eventTypes).toContain("run:started");
		expect(eventTypes).toContain("case:completed");
		expect(eventTypes).toContain("run:completed");
	});

	it("should use exact-match as default scorer when scorers is undefined", async () => {
		const result = await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [makeCustomConfig("TestLLM")],
			// scorers intentionally omitted
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.results[0].scores).toHaveLength(1);
		expect(result.results[0].scores[0].scorerName).toBe("Exact Match");
		expect(result.results[0].scores[0].value).toBe(1);
	});

	it("should produce no scores when scorers is an empty array", async () => {
		const result = await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [makeCustomConfig("TestLLM")],
			scorers: [],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.results[0].scores).toHaveLength(0);
		expect(Object.keys(result.scorerAverages)).toHaveLength(0);
	});

	it("should throw on empty testCases", async () => {
		await expect(
			evaluate({
				testCases: [],
				providers: [makeCustomConfig("TestLLM")],
				customProviders: new Map([["TestLLM", cannedGenerateFn]]),
			}),
		).rejects.toThrow("testCases must not be empty");
	});

	it("should throw on empty providers", async () => {
		await expect(
			evaluate({
				testCases: [{ input: "test", expected: "test" }],
				providers: [],
			}),
		).rejects.toThrow("providers must not be empty");
	});

	it("should throw when custom provider is missing from customProviders map", async () => {
		await expect(
			evaluate({
				testCases: [{ input: "test", expected: "test" }],
				providers: [makeCustomConfig("MissingLLM")],
				// no customProviders map at all
			}),
		).rejects.toThrow('Custom provider "MissingLLM" requires a matching entry');
	});
});

describe("evaluateQuick() SDK", () => {
	it("should evaluate a single prompt with expected value", async () => {
		const result = await evaluateQuick({
			prompt: "What is the capital of France?",
			expected: "Paris",
			providers: [makeCustomConfig("TestLLM")],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.status).toBe("completed");
		expect(result.results).toHaveLength(1);
		expect(result.results[0].result.output).toBe("Paris");
		expect(result.results[0].scores).toHaveLength(1);
		expect(result.results[0].scores[0].value).toBe(1);
	});

	it("should skip scoring when no expected value and no explicit scorers", async () => {
		const result = await evaluateQuick({
			prompt: "What is the capital of France?",
			// no expected
			providers: [makeCustomConfig("TestLLM")],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
		});

		expect(result.status).toBe("completed");
		expect(result.results).toHaveLength(1);
		expect(result.results[0].result.output).toBe("Paris");
		expect(result.results[0].scores).toHaveLength(0);
	});

	it("should score when expected is empty string (explicit undefined vs empty)", async () => {
		const emptyFn: CustomGenerateFn = async () => ({
			output: "",
			latencyMs: 5,
			tokenUsage: { inputTokens: 3, outputTokens: 0, totalTokens: 3 },
		});

		const result = await evaluateQuick({
			prompt: "Return nothing",
			expected: "",
			providers: [makeCustomConfig("EmptyLLM")],
			customProviders: new Map([["EmptyLLM", emptyFn]]),
		});

		// expected: "" is explicitly provided, so scoring should run
		expect(result.results[0].scores).toHaveLength(1);
		expect(result.results[0].scores[0].scorerName).toBe("Exact Match");
		expect(result.results[0].scores[0].value).toBe(1);
	});

	it("should handle multiple providers in quick mode", async () => {
		const secondFn: CustomGenerateFn = async () => ({
			output: "London",
			latencyMs: 5,
			tokenUsage: { inputTokens: 3, outputTokens: 2, totalTokens: 5 },
		});

		const result = await evaluateQuick({
			prompt: "What is the capital of France?",
			expected: "Paris",
			providers: [makeCustomConfig("GoodLLM"), makeCustomConfig("BadLLM")],
			customProviders: new Map([
				["GoodLLM", cannedGenerateFn],
				["BadLLM", secondFn],
			]),
		});

		expect(result.results).toHaveLength(2);
		const outputs = result.results.map((r) => r.result.output);
		expect(outputs).toContain("Paris");
		expect(outputs).toContain("London");
	});

	it("should forward concurrency, maxRetries, and timeoutMs to evaluate", async () => {
		const events: EvalEvent[] = [];

		const result = await evaluateQuick({
			prompt: "What is the capital of France?",
			expected: "Paris",
			providers: [makeCustomConfig("TestLLM")],
			customProviders: new Map([["TestLLM", cannedGenerateFn]]),
			concurrency: 1,
			maxRetries: 0,
			timeoutMs: 5000,
			projectName: "quick-project",
			datasetName: "quick-dataset",
			onEvent: (e) => events.push(e),
		});

		expect(result.status).toBe("completed");
		expect(result.run.config.concurrency).toBe(1);
		expect(result.run.config.maxRetries).toBe(0);
		expect(result.run.config.timeoutMs).toBe(5000);
		expect(events.length).toBeGreaterThan(0);
	});

	it("should include timeToFirstTokenMs in results when provider returns it", async () => {
		const streamingFn: CustomGenerateFn = async () => ({
			output: "Paris",
			latencyMs: 200,
			timeToFirstTokenMs: 50,
			tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
		});

		const result = await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [{ type: "custom", name: "StreamLLM", model: "stream-v1" }],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["StreamLLM", streamingFn]]),
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].result.timeToFirstTokenMs).toBe(50);
	});
});
