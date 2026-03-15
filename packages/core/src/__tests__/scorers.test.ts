import { describe, expect, it } from "vitest";
import { WeightedAverageScorer } from "../scorers/composite/weighted-average.js";
import { ContainsScorer } from "../scorers/deterministic/contains.js";
import { ExactMatchScorer } from "../scorers/deterministic/exact-match.js";
import { JsonMatchScorer } from "../scorers/deterministic/json-match.js";
import { JsonSchemaScorer } from "../scorers/deterministic/json-schema.js";
import { RegexScorer } from "../scorers/deterministic/regex.js";
import { BleuScorer } from "../scorers/semantic/bleu.js";
import { CosineSimilarityScorer } from "../scorers/semantic/cosine-similarity.js";
import { EmbeddingSimilarityScorer } from "../scorers/semantic/embedding-similarity.js";
import { LevenshteinScorer } from "../scorers/semantic/levenshtein.js";
import { RougeScorer } from "../scorers/semantic/rouge.js";

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

describe("LevenshteinScorer", () => {
	it("should return 1 for identical strings", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("hello", "hello");
		expect(result.value).toBe(1);
	});

	it("should return 0 for completely different strings", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("abc", "xyz");
		expect(result.value).toBe(0);
	});

	it("should return 1 for both empty strings", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("", "");
		expect(result.value).toBe(1);
	});

	it("should return 0 when one string is empty", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("hello", "");
		expect(result.value).toBe(0);
	});

	it("should compute partial similarity", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("kitten", "sitting");
		expect(result.value).toBeGreaterThan(0);
		expect(result.value).toBeLessThan(1);
		expect(result.metadata).toHaveProperty("editDistance");
	});

	it("should be case insensitive by default", async () => {
		const scorer = new LevenshteinScorer();
		const result = await scorer.score("Hello", "hello");
		expect(result.value).toBe(1);
	});

	it("should respect case sensitivity option", async () => {
		const scorer = new LevenshteinScorer({ caseSensitive: true });
		const result = await scorer.score("Hello", "hello");
		expect(result.value).toBeLessThan(1);
	});
});

describe("BleuScorer", () => {
	it("should return 1 for identical text", async () => {
		const scorer = new BleuScorer();
		const result = await scorer.score("the cat sat on the mat", "the cat sat on the mat");
		expect(result.value).toBeCloseTo(1);
	});

	it("should return 0 for completely different text", async () => {
		const scorer = new BleuScorer();
		const result = await scorer.score("alpha beta gamma", "x y z");
		expect(result.value).toBe(0);
	});

	it("should return 0 for empty candidate", async () => {
		const scorer = new BleuScorer();
		const result = await scorer.score("", "reference text");
		expect(result.value).toBe(0);
	});

	it("should return partial score for similar text", async () => {
		const scorer = new BleuScorer({ maxN: 2 });
		const result = await scorer.score("the cat sat on the mat", "the cat is on the mat");
		expect(result.value).toBeGreaterThan(0);
		expect(result.value).toBeLessThan(1);
	});

	it("should apply brevity penalty for short candidates", async () => {
		const scorer = new BleuScorer();
		const result = await scorer.score("the cat", "the cat sat on the mat");
		expect(result.metadata).toHaveProperty("brevityPenalty");
		expect(result.metadata?.brevityPenalty as number).toBeLessThan(1);
	});
});

describe("RougeScorer", () => {
	it("should return 1 for identical text (ROUGE-L)", async () => {
		const scorer = new RougeScorer();
		const result = await scorer.score("the cat sat on the mat", "the cat sat on the mat");
		expect(result.value).toBeCloseTo(1);
	});

	it("should return 0 for completely different text", async () => {
		const scorer = new RougeScorer();
		const result = await scorer.score("alpha beta gamma", "x y z");
		expect(result.value).toBe(0);
	});

	it("should return partial score for overlapping text", async () => {
		const scorer = new RougeScorer();
		const result = await scorer.score("the cat sat on the mat", "the cat is on the mat");
		expect(result.value).toBeGreaterThan(0);
		expect(result.value).toBeLessThan(1);
	});

	it("should return 1 for both empty", async () => {
		const scorer = new RougeScorer();
		const result = await scorer.score("", "");
		expect(result.value).toBe(1);
	});

	it("should support ROUGE-N variant", async () => {
		const scorer = new RougeScorer({ variant: "rouge-n", n: 1 });
		const result = await scorer.score("the cat sat on the mat", "the cat sat on the mat");
		expect(result.value).toBeCloseTo(1);
		expect(result.metadata?.variant).toBe("rouge-n");
	});

	it("should support ROUGE-N bigrams", async () => {
		const scorer = new RougeScorer({ variant: "rouge-n", n: 2 });
		const result = await scorer.score("the cat sat on the mat", "the cat is on the mat");
		expect(result.value).toBeGreaterThan(0);
		expect(result.value).toBeLessThan(1);
	});
});

describe("JsonSchemaScorer", () => {
	it("should return 1 for valid output against schema", async () => {
		const scorer = new JsonSchemaScorer();
		const schema = JSON.stringify({
			type: "object",
			properties: { name: { type: "string" }, age: { type: "number" } },
			required: ["name", "age"],
		});
		const result = await scorer.score('{"name":"Alice","age":30}', schema);
		expect(result.value).toBe(1);
	});

	it("should return 0 for invalid output against schema", async () => {
		const scorer = new JsonSchemaScorer();
		const schema = JSON.stringify({
			type: "object",
			properties: { name: { type: "string" }, age: { type: "number" } },
			required: ["name", "age"],
		});
		const result = await scorer.score('{"name":"Alice"}', schema);
		expect(result.value).toBe(0);
		expect(result.metadata?.errors).toBeDefined();
	});

	it("should return 0 for invalid JSON output", async () => {
		const scorer = new JsonSchemaScorer();
		const schema = JSON.stringify({ type: "object" });
		const result = await scorer.score("not json", schema);
		expect(result.value).toBe(0);
	});

	it("should return 0 for invalid schema", async () => {
		const scorer = new JsonSchemaScorer();
		const result = await scorer.score('{"a":1}', "not a schema");
		expect(result.value).toBe(0);
	});
});

describe("EmbeddingSimilarityScorer", () => {
	const mockEmbedFn = async (text: string): Promise<number[]> => {
		// Simple mock: hash text to a fixed-length vector
		const vec = [0, 0, 0, 0];
		for (let i = 0; i < text.length; i++) {
			vec[i % 4] += text.charCodeAt(i);
		}
		const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
		return norm === 0 ? vec : vec.map((v) => v / norm);
	};

	it("should return 1 for identical text", async () => {
		const scorer = new EmbeddingSimilarityScorer(mockEmbedFn);
		const result = await scorer.score("hello world", "hello world");
		expect(result.value).toBeCloseTo(1);
	});

	it("should return a score between 0 and 1", async () => {
		const scorer = new EmbeddingSimilarityScorer(mockEmbedFn);
		const result = await scorer.score("hello world", "goodbye universe");
		expect(result.value).toBeGreaterThanOrEqual(0);
		expect(result.value).toBeLessThanOrEqual(1);
	});

	it("should include dimensions in metadata", async () => {
		const scorer = new EmbeddingSimilarityScorer(mockEmbedFn);
		const result = await scorer.score("test", "test");
		expect(result.metadata?.dimensions).toBe(4);
	});

	it("should handle dimension mismatch", async () => {
		let callCount = 0;
		const badEmbedFn = async (_text: string): Promise<number[]> => {
			callCount++;
			return callCount === 1 ? [1, 2, 3] : [1, 2];
		};
		const scorer = new EmbeddingSimilarityScorer(badEmbedFn);
		const result = await scorer.score("a", "b");
		expect(result.value).toBe(0);
	});
});
