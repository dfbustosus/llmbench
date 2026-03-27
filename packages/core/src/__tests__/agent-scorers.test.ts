import type { IProvider, ProviderResponse, ToolCall } from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import { GoalCompletionScorer } from "../scorers/agent/goal-completion.js";
import { ToolCallAccuracyScorer } from "../scorers/agent/tool-call-accuracy.js";
import { TrajectoryValidationScorer } from "../scorers/agent/trajectory-validation.js";
import {
	deepEqual,
	extractExpectedToolCalls,
	extractToolCalls,
	parseArguments,
} from "../scorers/agent/utils.js";
import { createScorer } from "../scorers/index.js";

// ── Helpers ─────────────────────────────────────────────────────────

function tc(name: string, args?: string): ToolCall {
	return {
		id: `call_${name}`,
		type: "function",
		function: { name, arguments: args ?? "{}" },
	};
}

function expected(name: string, args?: string) {
	return args !== undefined ? { function: { name, arguments: args } } : { function: { name } };
}

function createMockProvider(responses: string[]): IProvider {
	let callIndex = 0;
	return {
		type: "custom",
		name: "mock",
		model: "mock",
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
		name: "error",
		model: "error",
		generate: vi.fn().mockImplementation(
			async (): Promise<ProviderResponse> => ({
				output: "",
				error: "API failed",
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
				latencyMs: 0,
			}),
		),
	} as unknown as IProvider;
}

// ── Utils ───────────────────────────────────────────────────────────

describe("extractToolCalls", () => {
	it("should return empty for undefined context", () => {
		expect(extractToolCalls(undefined)).toEqual([]);
	});

	it("should return empty when toolCalls key is missing", () => {
		expect(extractToolCalls({ other: 1 })).toEqual([]);
	});

	it("should extract valid tool calls", () => {
		const calls = [tc("get_weather", '{"city":"Paris"}')];
		expect(extractToolCalls({ toolCalls: calls })).toEqual(calls);
	});

	it("should filter out malformed entries", () => {
		const calls = [tc("valid"), { bad: "data" }, null, tc("also_valid")];
		const result = extractToolCalls({ toolCalls: calls });
		expect(result).toHaveLength(2);
		expect(result[0].function.name).toBe("valid");
		expect(result[1].function.name).toBe("also_valid");
	});
});

describe("extractExpectedToolCalls", () => {
	it("should return empty for undefined context", () => {
		expect(extractExpectedToolCalls(undefined)).toEqual([]);
	});

	it("should return empty when key is missing", () => {
		expect(extractExpectedToolCalls({ other: 1 })).toEqual([]);
	});

	it("should extract expected calls with name and args", () => {
		const exp = [expected("get_weather", '{"city":"Paris"}')];
		expect(extractExpectedToolCalls({ expectedToolCalls: exp })).toEqual(exp);
	});

	it("should extract expected calls with name only", () => {
		const exp = [expected("get_weather")];
		const result = extractExpectedToolCalls({ expectedToolCalls: exp });
		expect(result).toHaveLength(1);
		expect(result[0].function.name).toBe("get_weather");
	});

	it("should filter out entries without function.name", () => {
		const exp = [expected("valid"), { function: {} }, { bad: true }];
		const result = extractExpectedToolCalls({ expectedToolCalls: exp });
		expect(result).toHaveLength(1);
	});
});

describe("deepEqual", () => {
	it("should match identical objects", () => {
		expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
	});

	it("should match objects with different key order", () => {
		expect(deepEqual({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true);
	});

	it("should reject different values", () => {
		expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
	});

	it("should reject different key counts", () => {
		expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
	});

	it("should handle nested objects", () => {
		expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
		expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
	});

	it("should handle arrays (order sensitive)", () => {
		expect(deepEqual([1, 2], [1, 2])).toBe(true);
		expect(deepEqual([1, 2], [2, 1])).toBe(false);
	});

	it("should handle primitives", () => {
		expect(deepEqual("abc", "abc")).toBe(true);
		expect(deepEqual(42, 42)).toBe(true);
		expect(deepEqual(null, null)).toBe(true);
		expect(deepEqual("abc", "xyz")).toBe(false);
	});
});

describe("parseArguments", () => {
	it("should parse valid JSON", () => {
		expect(parseArguments('{"city":"Paris"}')).toEqual({ city: "Paris" });
	});

	it("should return null for invalid JSON", () => {
		expect(parseArguments("not json")).toBeNull();
	});

	it("should return null for empty string", () => {
		expect(parseArguments("")).toBeNull();
	});

	it("should return null for undefined", () => {
		expect(parseArguments(undefined)).toBeNull();
	});
});

// ── Tool Call Accuracy ──────────────────────────────────────────────

describe("ToolCallAccuracyScorer", () => {
	const scorer = new ToolCallAccuracyScorer();

	it("should return 1.0 when all expected calls match", async () => {
		const ctx = {
			toolCalls: [tc("get_weather", '{"city":"Paris"}'), tc("get_time", '{"tz":"UTC"}')],
			expectedToolCalls: [
				expected("get_weather", '{"city":"Paris"}'),
				expected("get_time", '{"tz":"UTC"}'),
			],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should return 0 when no expected calls match", async () => {
		const ctx = {
			toolCalls: [tc("wrong_fn")],
			expectedToolCalls: [expected("get_weather", '{"city":"Paris"}')],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
	});

	it("should return 0.5 when half match", async () => {
		const ctx = {
			toolCalls: [tc("get_weather", '{"city":"Paris"}'), tc("wrong_fn")],
			expectedToolCalls: [
				expected("get_weather", '{"city":"Paris"}'),
				expected("get_time", '{"tz":"UTC"}'),
			],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0.5);
	});

	it("should handle argument key order insensitivity", async () => {
		const ctx = {
			toolCalls: [tc("fn", '{"b":2,"a":1}')],
			expectedToolCalls: [expected("fn", '{"a":1,"b":2}')],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should match by name only when expected has no arguments", async () => {
		const ctx = {
			toolCalls: [tc("get_weather", '{"city":"Paris"}')],
			expectedToolCalls: [expected("get_weather")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should not double-count matches", async () => {
		const ctx = {
			toolCalls: [tc("fn", '{"a":1}')],
			expectedToolCalls: [expected("fn", '{"a":1}'), expected("fn", '{"a":1}')],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0.5); // 1 actual, 2 expected, only 1 match
	});

	it("should return 0 when actual is empty", async () => {
		const ctx = {
			toolCalls: [],
			expectedToolCalls: [expected("fn")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
	});

	it("should return error when expected is missing", async () => {
		const ctx = { toolCalls: [tc("fn")] };
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("expectedToolCalls");
	});
});

// ── Trajectory Validation ───────────────────────────────────────────

describe("TrajectoryValidationScorer", () => {
	const scorer = new TrajectoryValidationScorer();

	it("should return 1.0 for exact sequence match", async () => {
		const ctx = {
			toolCalls: [tc("search"), tc("fetch"), tc("save")],
			expectedToolCalls: [expected("search"), expected("fetch"), expected("save")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should return 1.0 when expected is subsequence of actual", async () => {
		const ctx = {
			toolCalls: [tc("search"), tc("retry"), tc("fetch"), tc("log"), tc("save")],
			expectedToolCalls: [expected("search"), expected("fetch"), expected("save")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should return 0 when actual is completely unrelated", async () => {
		const ctx = {
			toolCalls: [tc("x"), tc("y"), tc("z")],
			expectedToolCalls: [expected("a"), expected("b"), expected("c")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
	});

	it("should return partial score for partial order match", async () => {
		// Expected: search -> fetch -> save
		// Actual: search -> save (fetch missing, but search->save in order)
		const ctx = {
			toolCalls: [tc("search"), tc("save")],
			expectedToolCalls: [expected("search"), expected("fetch"), expected("save")],
		};
		const result = await scorer.score("", "", "", ctx);
		// LCS of [search,save] vs [search,fetch,save] = [search,save] = 2
		// Score = 2/3
		expect(result.value).toBeCloseTo(2 / 3, 4);
	});

	it("should handle repeated function names", async () => {
		const ctx = {
			toolCalls: [tc("retry"), tc("retry"), tc("retry"), tc("done")],
			expectedToolCalls: [expected("retry"), expected("retry"), expected("done")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(1);
	});

	it("should return 0 when actual is empty", async () => {
		const ctx = {
			toolCalls: [],
			expectedToolCalls: [expected("fn")],
		};
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
	});

	it("should return error when expected is missing", async () => {
		const ctx = { toolCalls: [tc("fn")] };
		const result = await scorer.score("", "", "", ctx);
		expect(result.value).toBe(0);
		expect(result.reason).toContain("expectedToolCalls");
	});
});

// ── Goal Completion ─────────────────────────────────────────────────

describe("GoalCompletionScorer", () => {
	it("should return high score when LLM judges goal achieved", async () => {
		const provider = createMockProvider([
			JSON.stringify({ score: 0.9, reason: "Goal fully achieved" }),
		]);
		const scorer = new GoalCompletionScorer(provider);
		const ctx = { toolCalls: [tc("search", '{"q":"weather"}')] };
		const result = await scorer.score(
			"The weather is sunny",
			"Weather info",
			"Get the weather",
			ctx,
		);
		expect(result.value).toBe(0.9);
		expect(result.reason).toBe("Goal fully achieved");
	});

	it("should return low score when LLM judges goal not achieved", async () => {
		const provider = createMockProvider([JSON.stringify({ score: 0.1, reason: "Goal not met" })]);
		const scorer = new GoalCompletionScorer(provider);
		const result = await scorer.score("I don't know", "Weather info", "Get the weather", {});
		expect(result.value).toBe(0.1);
	});

	it("should return 0 on LLM error response", async () => {
		const scorer = new GoalCompletionScorer(createErrorProvider());
		const result = await scorer.score("output", "expected", "goal", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("LLM error");
	});

	it("should return 0 on invalid JSON response", async () => {
		const provider = createMockProvider(["not json"]);
		const scorer = new GoalCompletionScorer(provider);
		const result = await scorer.score("output", "expected", "goal", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Failed to parse");
	});

	it("should return 0 on provider exception", async () => {
		const provider = {
			type: "custom",
			name: "throw",
			model: "throw",
			generate: vi.fn().mockRejectedValue(new Error("Timeout")),
		} as unknown as IProvider;
		const scorer = new GoalCompletionScorer(provider);
		const result = await scorer.score("output", "expected", "goal", {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Goal completion failed");
	});

	it("should return error when input is missing", async () => {
		const provider = createMockProvider([]);
		const scorer = new GoalCompletionScorer(provider);
		const result = await scorer.score("output", "expected", undefined, {});
		expect(result.value).toBe(0);
		expect(result.reason).toContain("No input/goal");
	});

	it("should include tool calls in prompt", async () => {
		const provider = createMockProvider([JSON.stringify({ score: 1, reason: "ok" })]);
		const scorer = new GoalCompletionScorer(provider);
		const ctx = { toolCalls: [tc("search", '{"q":"test"}')] };
		await scorer.score("output", "expected", "goal", ctx);
		const call = (provider.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
		expect(call).toContain("search");
	});
});

// ── Factory integration ─────────────────────────────────────────────

describe("createScorer with agent types", () => {
	it("should create tool-call-accuracy without provider", () => {
		const scorer = createScorer({ id: "tca", name: "TCA", type: "tool-call-accuracy" });
		expect(scorer.type).toBe("tool-call-accuracy");
	});

	it("should create trajectory-validation without provider", () => {
		const scorer = createScorer({ id: "tv", name: "TV", type: "trajectory-validation" });
		expect(scorer.type).toBe("trajectory-validation");
	});

	it("should create goal-completion with provider", () => {
		const scorer = createScorer(
			{ id: "gc", name: "GC", type: "goal-completion" },
			{ provider: createMockProvider([]) },
		);
		expect(scorer.type).toBe("goal-completion");
	});

	it("should throw when goal-completion created without provider", () => {
		expect(() => createScorer({ id: "gc", name: "GC", type: "goal-completion" })).toThrow(
			"requires a provider",
		);
	});
});
