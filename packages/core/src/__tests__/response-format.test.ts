import type { ProviderConfig } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import type { CustomGenerateFn } from "../providers/custom-provider.js";
import { evaluate } from "../sdk/evaluate.js";

describe("responseFormat", () => {
	it("should pass responseFormat through to custom provider", async () => {
		let capturedConfig: ProviderConfig | undefined;
		const spyFn: CustomGenerateFn = async (_input, config) => {
			capturedConfig = config;
			return {
				output: '{"answer": "Paris"}',
				latencyMs: 10,
				tokenUsage: { inputTokens: 5, outputTokens: 8, totalTokens: 13 },
			};
		};

		await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: '{"answer": "Paris"}' }],
			providers: [
				{
					type: "custom",
					name: "JsonLLM",
					model: "json-v1",
					responseFormat: { type: "json_object" },
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["JsonLLM", spyFn]]),
		});

		expect(capturedConfig?.responseFormat).toEqual({ type: "json_object" });
	});

	it("should work without responseFormat set", async () => {
		let capturedConfig: ProviderConfig | undefined;
		const spyFn: CustomGenerateFn = async (_input, config) => {
			capturedConfig = config;
			return {
				output: "Paris",
				latencyMs: 10,
				tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
			};
		};

		await evaluate({
			testCases: [{ input: "What is the capital of France?", expected: "Paris" }],
			providers: [{ type: "custom", name: "PlainLLM", model: "plain-v1" }],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["PlainLLM", spyFn]]),
		});

		expect(capturedConfig?.responseFormat).toBeUndefined();
	});
});
