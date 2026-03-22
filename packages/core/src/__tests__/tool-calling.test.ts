import type { ProviderConfig, ToolCall, ToolDefinition } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import type { CustomGenerateFn } from "../providers/custom-provider.js";
import { evaluate } from "../sdk/evaluate.js";

const SAMPLE_TOOLS: ToolDefinition[] = [
	{
		type: "function",
		function: {
			name: "get_weather",
			description: "Get the weather for a location",
			parameters: {
				type: "object",
				properties: { location: { type: "string" } },
				required: ["location"],
			},
		},
	},
];

const SAMPLE_TOOL_CALLS: ToolCall[] = [
	{
		id: "call_1",
		type: "function",
		function: { name: "get_weather", arguments: '{"location":"Paris"}' },
	},
];

describe("tool/function calling", () => {
	it("should pass tools and toolChoice through to custom provider", async () => {
		let capturedConfig: ProviderConfig | undefined;
		const spyFn: CustomGenerateFn = async (_input, config) => {
			capturedConfig = config;
			return {
				output: JSON.stringify(SAMPLE_TOOL_CALLS),
				latencyMs: 10,
				tokenUsage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
				toolCalls: SAMPLE_TOOL_CALLS,
			};
		};

		await evaluate({
			testCases: [
				{
					input: "What is the weather in Paris?",
					expected: JSON.stringify(SAMPLE_TOOL_CALLS),
				},
			],
			providers: [
				{
					type: "custom",
					name: "ToolLLM",
					model: "tool-v1",
					tools: SAMPLE_TOOLS,
					toolChoice: "auto",
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["ToolLLM", spyFn]]),
		});

		expect(capturedConfig?.tools).toEqual(SAMPLE_TOOLS);
		expect(capturedConfig?.toolChoice).toBe("auto");
	});

	it("should include toolCalls in evaluation results", async () => {
		const spyFn: CustomGenerateFn = async () => ({
			output: JSON.stringify(SAMPLE_TOOL_CALLS),
			latencyMs: 10,
			tokenUsage: { inputTokens: 10, outputTokens: 15, totalTokens: 25 },
			toolCalls: SAMPLE_TOOL_CALLS,
		});

		const result = await evaluate({
			testCases: [
				{
					input: "What is the weather in Paris?",
					expected: JSON.stringify(SAMPLE_TOOL_CALLS),
				},
			],
			providers: [
				{
					type: "custom",
					name: "ToolLLM2",
					model: "tool-v2",
					tools: SAMPLE_TOOLS,
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["ToolLLM2", spyFn]]),
		});

		expect(result.results).toHaveLength(1);
		expect(result.results[0].result.toolCalls).toEqual(SAMPLE_TOOL_CALLS);
	});

	it("should work without tools (backward compatibility)", async () => {
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

		expect(capturedConfig?.tools).toBeUndefined();
		expect(capturedConfig?.toolChoice).toBeUndefined();
	});
});
