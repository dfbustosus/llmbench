import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDataset, validateDataset } from "../config/dataset-loader.js";

const TMP_DIR = resolve(import.meta.dirname, "__tmp_dataset_test__");

function writeTmpFile(name: string, content: string): string {
	const filePath = resolve(TMP_DIR, name);
	writeFileSync(filePath, content);
	return filePath;
}

beforeEach(() => {
	if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });
});

afterEach(() => {
	if (existsSync(TMP_DIR)) rmSync(TMP_DIR, { recursive: true });
});

describe("loadDataset — JSON", () => {
	it("should load a valid JSON dataset", () => {
		const json = JSON.stringify({
			name: "Test Dataset",
			testCases: [
				{ input: "Hello", expected: "Hi" },
				{ input: "2+2", expected: "4" },
			],
		});
		const filePath = writeTmpFile("test.json", json);
		const dataset = loadDataset(filePath);

		expect(dataset.name).toBe("Test Dataset");
		expect(dataset.testCases).toHaveLength(2);
		expect(dataset.testCases[0].input).toBe("Hello");
	});

	it("should reject JSON with missing testCases", () => {
		const filePath = writeTmpFile("bad.json", JSON.stringify({ name: "Bad" }));
		expect(() => loadDataset(filePath)).toThrow('"testCases" array');
	});

	it("should reject JSON with empty testCases", () => {
		const filePath = writeTmpFile("empty.json", JSON.stringify({ testCases: [] }));
		expect(() => loadDataset(filePath)).toThrow("at least one test case");
	});

	it("should reject malformed JSON", () => {
		const filePath = writeTmpFile("malformed.json", "not json{");
		expect(() => loadDataset(filePath)).toThrow("Failed to parse JSON");
	});
});

describe("loadDataset — YAML", () => {
	it("should load a valid YAML dataset", () => {
		const yaml = `
name: YAML Dataset
testCases:
  - input: "What is 2+2?"
    expected: "4"
  - input: "Capital of France?"
    expected: "Paris"
`;
		const filePath = writeTmpFile("test.yaml", yaml);
		const dataset = loadDataset(filePath);

		expect(dataset.name).toBe("YAML Dataset");
		expect(dataset.testCases).toHaveLength(2);
		expect(dataset.testCases[0].expected).toBe("4");
	});

	it("should load .yml extension", () => {
		const yaml = `
testCases:
  - input: "Hello"
    expected: "World"
`;
		const filePath = writeTmpFile("test.yml", yaml);
		const dataset = loadDataset(filePath);
		expect(dataset.testCases).toHaveLength(1);
	});

	it("should reject malformed YAML", () => {
		const filePath = writeTmpFile("bad.yaml", ":\n  - :\n  bad: [unclosed");
		expect(() => loadDataset(filePath)).toThrow("Failed to parse YAML");
	});
});

describe("loadDataset — assertions", () => {
	it("should load YAML dataset with assertions", () => {
		const yaml = `
name: Assertion Dataset
testCases:
  - input: "What is 2+2?"
    expected: "4"
    assert:
      - type: exact-match
        value: "4"
      - type: contains
        value: "4"
`;
		const filePath = writeTmpFile("assert.yaml", yaml);
		const dataset = loadDataset(filePath);

		expect(dataset.testCases[0].assert).toHaveLength(2);
		expect(dataset.testCases[0].assert?.[0].type).toBe("exact-match");
		expect(dataset.testCases[0].assert?.[0].value).toBe("4");
		expect(dataset.testCases[0].assert?.[1].type).toBe("contains");
	});

	it("should load JSON dataset with assertions", () => {
		const json = JSON.stringify({
			testCases: [
				{
					input: "Hello",
					expected: "Hi",
					assert: [
						{ type: "contains", value: "Hi" },
						{ type: "regex", value: "^Hi" },
					],
				},
			],
		});
		const filePath = writeTmpFile("assert.json", json);
		const dataset = loadDataset(filePath);

		expect(dataset.testCases[0].assert).toHaveLength(2);
		expect(dataset.testCases[0].assert?.[1].type).toBe("regex");
	});

	it("should allow expected to be omitted when assert is present", () => {
		const yaml = `
testCases:
  - input: "What is 2+2?"
    assert:
      - type: contains
        value: "4"
`;
		const filePath = writeTmpFile("no-expected.yaml", yaml);
		const dataset = loadDataset(filePath);

		expect(dataset.testCases[0].expected).toBe("");
		expect(dataset.testCases[0].assert).toHaveLength(1);
	});

	it("should require expected when no assert is present", () => {
		const json = JSON.stringify({ testCases: [{ input: "Hello" }] });
		const filePath = writeTmpFile("no-expected.json", json);
		expect(() => loadDataset(filePath)).toThrow('"expected" field (or provide "assert" array)');
	});

	it("should reject invalid assertion type", () => {
		const json = JSON.stringify({
			testCases: [
				{
					input: "Q",
					expected: "A",
					assert: [{ type: "bleu-score", value: "A" }],
				},
			],
		});
		const filePath = writeTmpFile("bad-type.json", json);
		expect(() => loadDataset(filePath)).toThrow("is not valid");
	});

	it("should reject assertion missing value", () => {
		const json = JSON.stringify({
			testCases: [
				{
					input: "Q",
					expected: "A",
					assert: [{ type: "exact-match" }],
				},
			],
		});
		const filePath = writeTmpFile("no-value.json", json);
		expect(() => loadDataset(filePath)).toThrow("value must be a string");
	});

	it("should reject negative weight", () => {
		const json = JSON.stringify({
			testCases: [
				{
					input: "Q",
					expected: "A",
					assert: [{ type: "exact-match", value: "A", weight: -1 }],
				},
			],
		});
		const filePath = writeTmpFile("neg-weight.json", json);
		expect(() => loadDataset(filePath)).toThrow("weight must be a non-negative number");
	});

	it("should accept assertion with weight and options", () => {
		const json = JSON.stringify({
			testCases: [
				{
					input: "Q",
					expected: "A",
					assert: [
						{
							type: "exact-match",
							value: "A",
							weight: 2.0,
							options: { caseSensitive: false },
						},
					],
				},
			],
		});
		const filePath = writeTmpFile("full-assert.json", json);
		const dataset = loadDataset(filePath);

		expect(dataset.testCases[0].assert?.[0].weight).toBe(2.0);
		expect(dataset.testCases[0].assert?.[0].options).toEqual({ caseSensitive: false });
	});
});

describe("validateDataset", () => {
	it("should reject non-object", () => {
		expect(() => validateDataset("string")).toThrow("must contain an object");
	});

	it("should reject null", () => {
		expect(() => validateDataset(null)).toThrow("must contain an object");
	});

	it("should reject test case missing input", () => {
		expect(() => validateDataset({ testCases: [{ expected: "A" }] })).toThrow(
			'must have a string "input"',
		);
	});
});

describe("loadDataset — file not found", () => {
	it("should throw for non-existent file", () => {
		expect(() => loadDataset("/nonexistent/path.json")).toThrow("Dataset file not found");
	});
});
