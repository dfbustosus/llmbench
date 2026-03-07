import { describe, expect, it } from "vitest";
import { WeightedAverageScorer } from "../scorers/composite/weighted-average.js";
import { ContainsScorer } from "../scorers/deterministic/contains.js";
import { ExactMatchScorer } from "../scorers/deterministic/exact-match.js";
import { JsonMatchScorer } from "../scorers/deterministic/json-match.js";
import { RegexScorer } from "../scorers/deterministic/regex.js";
import { CosineSimilarityScorer } from "../scorers/semantic/cosine-similarity.js";

describe("ExactMatchScorer", () => {
	it("should return 1 for exact match", async () => {
		const scorer = new ExactMatchScorer();
		const result = await scorer.score("hello", "hello");
		expect(result.value).toBe(1);
	});

	it("should return 0 for mismatch", async () => {
		const scorer = new ExactMatchScorer();
		const result = await scorer.score("hello", "world");
		expect(result.value).toBe(0);
	});

	it("should be case insensitive by default", async () => {
		const scorer = new ExactMatchScorer();
		const result = await scorer.score("Hello", "hello");
		expect(result.value).toBe(1);
	});

	it("should respect case sensitivity option", async () => {
		const scorer = new ExactMatchScorer({ caseSensitive: true });
		const result = await scorer.score("Hello", "hello");
		expect(result.value).toBe(0);
	});

	it("should trim whitespace by default", async () => {
		const scorer = new ExactMatchScorer();
		const result = await scorer.score("  hello  ", "hello");
		expect(result.value).toBe(1);
	});
});

describe("ContainsScorer", () => {
	it("should return 1 when output contains expected", async () => {
		const scorer = new ContainsScorer();
		const result = await scorer.score("The answer is 42", "42");
		expect(result.value).toBe(1);
	});

	it("should return 0 when output does not contain expected", async () => {
		const scorer = new ContainsScorer();
		const result = await scorer.score("The answer is 42", "43");
		expect(result.value).toBe(0);
	});

	it("should be case insensitive by default", async () => {
		const scorer = new ContainsScorer();
		const result = await scorer.score("Hello World", "hello");
		expect(result.value).toBe(1);
	});
});

describe("RegexScorer", () => {
	it("should match regex pattern", async () => {
		const scorer = new RegexScorer();
		const result = await scorer.score("The answer is 42", "\\d+");
		expect(result.value).toBe(1);
	});

	it("should not match non-matching pattern", async () => {
		const scorer = new RegexScorer();
		const result = await scorer.score("hello", "^\\d+$");
		expect(result.value).toBe(0);
	});

	it("should handle invalid regex gracefully", async () => {
		const scorer = new RegexScorer();
		const result = await scorer.score("test", "[invalid");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Invalid regex");
	});
});

describe("JsonMatchScorer", () => {
	it("should match identical JSON", async () => {
		const scorer = new JsonMatchScorer();
		const result = await scorer.score('{"a":1,"b":2}', '{"b":2,"a":1}');
		expect(result.value).toBe(1);
	});

	it("should not match different JSON", async () => {
		const scorer = new JsonMatchScorer();
		const result = await scorer.score('{"a":1}', '{"a":2}');
		expect(result.value).toBe(0);
	});

	it("should support partial matching", async () => {
		const scorer = new JsonMatchScorer({ partial: true });
		const result = await scorer.score('{"a":1,"b":2,"c":3}', '{"a":1,"b":2}');
		expect(result.value).toBe(1);
	});

	it("should handle invalid JSON gracefully", async () => {
		const scorer = new JsonMatchScorer();
		const result = await scorer.score("not json", '{"a":1}');
		expect(result.value).toBe(0);
		expect(result.reason).toContain("JSON parse error");
	});
});

describe("CosineSimilarityScorer", () => {
	it("should return 1 for identical text", async () => {
		const scorer = new CosineSimilarityScorer();
		const result = await scorer.score("hello world", "hello world");
		expect(result.value).toBeCloseTo(1);
	});

	it("should return >0 for similar text", async () => {
		const scorer = new CosineSimilarityScorer();
		const result = await scorer.score("The cat sat on the mat", "The cat is on the mat");
		expect(result.value).toBeGreaterThan(0.5);
	});

	it("should return 0 for completely different text", async () => {
		const scorer = new CosineSimilarityScorer();
		const result = await scorer.score("hello", "xyz");
		expect(result.value).toBe(0);
	});
});

describe("WeightedAverageScorer", () => {
	it("should compute weighted average", async () => {
		const scorer = new WeightedAverageScorer([
			{ scorer: new ExactMatchScorer(), weight: 1 },
			{ scorer: new ContainsScorer(), weight: 1 },
		]);

		// exact match fails, contains succeeds
		const result = await scorer.score("The answer is 42", "42");
		expect(result.value).toBe(0.5); // (0 * 1 + 1 * 1) / 2
	});

	it("should respect weights", async () => {
		const scorer = new WeightedAverageScorer([
			{ scorer: new ExactMatchScorer(), weight: 3 },
			{ scorer: new ContainsScorer(), weight: 1 },
		]);

		const result = await scorer.score("The answer is 42", "42");
		expect(result.value).toBe(0.25); // (0 * 3 + 1 * 1) / 4
	});
});
