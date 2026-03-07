import { describe, expect, it } from "vitest";
import { CostCalculator } from "../cost/cost-calculator.js";

describe("CostCalculator", () => {
	const calculator = new CostCalculator();

	it("should calculate OpenAI gpt-4o costs correctly", () => {
		const cost = calculator.calculate("gpt-4o", "openai", {
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
		});

		expect(cost.inputCost).toBeCloseTo(0.0025); // 1000/1M * 2.5
		expect(cost.outputCost).toBeCloseTo(0.005); // 500/1M * 10
		expect(cost.totalCost).toBeCloseTo(0.0075);
		expect(cost.currency).toBe("USD");
	});

	it("should return 0 for unknown models", () => {
		const cost = calculator.calculate("unknown-model", "unknown", {
			inputTokens: 1000,
			outputTokens: 500,
			totalTokens: 1500,
		});

		expect(cost.totalCost).toBe(0);
	});

	it("should calculate Anthropic costs correctly", () => {
		const cost = calculator.calculate("claude-sonnet-4-6", "anthropic", {
			inputTokens: 1_000_000,
			outputTokens: 1_000_000,
			totalTokens: 2_000_000,
		});

		expect(cost.inputCost).toBe(3);
		expect(cost.outputCost).toBe(15);
		expect(cost.totalCost).toBe(18);
	});
});
