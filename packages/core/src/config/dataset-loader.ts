import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import type { TestCaseAssertion } from "@llmbench/types";
import { parse as parseYaml } from "yaml";

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

export interface DatasetFile {
	name?: string;
	description?: string;
	testCases: DatasetTestCase[];
}

export interface DatasetTestCase {
	input: string;
	expected: string;
	messages?: Array<{ role: string; content: string }>;
	context?: Record<string, unknown>;
	tags?: string[];
	assert?: TestCaseAssertion[];
}

const VALID_ASSERTION_TYPES = new Set([
	"exact-match",
	"contains",
	"regex",
	"json-match",
	"json-schema",
	"cosine-similarity",
	"levenshtein",
	"bleu",
	"rouge",
	"embedding-similarity",
	"llm-judge",
	"composite",
	"custom",
]);

export function loadDataset(datasetPath: string): DatasetFile {
	const absolutePath = resolve(datasetPath);

	if (!existsSync(absolutePath)) {
		throw new Error(`Dataset file not found: ${absolutePath}`);
	}

	const content = readFileSync(absolutePath, "utf-8");
	const ext = extname(absolutePath).toLowerCase();

	let data: unknown;
	if (YAML_EXTENSIONS.has(ext)) {
		try {
			data = parseYaml(content);
		} catch (e) {
			throw new Error(
				`Failed to parse YAML dataset: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	} else {
		try {
			data = JSON.parse(content);
		} catch (e) {
			throw new Error(
				`Failed to parse JSON dataset: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	validateDataset(data);
	return data;
}

export function validateDataset(data: unknown): asserts data is DatasetFile {
	if (!data || typeof data !== "object") {
		throw new Error("Dataset file must contain an object");
	}

	const obj = data as Record<string, unknown>;
	if (!Array.isArray(obj.testCases)) {
		throw new Error('Dataset file must have a "testCases" array');
	}

	if (obj.testCases.length === 0) {
		throw new Error("Dataset must contain at least one test case");
	}

	for (let i = 0; i < obj.testCases.length; i++) {
		validateTestCase(obj.testCases[i], i);
	}
}

function validateTestCase(tc: unknown, index: number): void {
	if (!tc || typeof tc !== "object") {
		throw new Error(`testCases[${index}] must be an object`);
	}

	const t = tc as Record<string, unknown>;

	if (typeof t.input !== "string") {
		throw new Error(`testCases[${index}] must have a string "input" field`);
	}

	// expected is required unless assert is provided
	const hasAssert = Array.isArray(t.assert) && t.assert.length > 0;
	if (typeof t.expected !== "string" && !hasAssert) {
		throw new Error(
			`testCases[${index}] must have a string "expected" field (or provide "assert" array)`,
		);
	}

	// Default expected to empty string when assertions are present but expected is omitted
	if (t.expected === undefined && hasAssert) {
		t.expected = "";
	}

	if (typeof t.expected !== "string") {
		throw new Error(`testCases[${index}].expected must be a string`);
	}

	if (t.assert !== undefined) {
		if (!Array.isArray(t.assert)) {
			throw new Error(`testCases[${index}].assert must be an array`);
		}
		for (let j = 0; j < t.assert.length; j++) {
			validateAssertion(t.assert[j], index, j);
		}
	}
}

function validateAssertion(assertion: unknown, testIndex: number, assertIndex: number): void {
	const path = `testCases[${testIndex}].assert[${assertIndex}]`;

	if (!assertion || typeof assertion !== "object") {
		throw new Error(`${path} must be an object`);
	}

	const a = assertion as Record<string, unknown>;

	if (typeof a.type !== "string" || !a.type) {
		throw new Error(`${path}.type must be a non-empty string`);
	}
	if (!VALID_ASSERTION_TYPES.has(a.type)) {
		throw new Error(
			`${path}.type "${a.type}" is not valid. Valid types: ${[...VALID_ASSERTION_TYPES].join(", ")}`,
		);
	}
	if (typeof a.value !== "string") {
		throw new Error(`${path}.value must be a string`);
	}
	if (a.weight !== undefined && (typeof a.weight !== "number" || a.weight < 0)) {
		throw new Error(`${path}.weight must be a non-negative number`);
	}
	if (a.options !== undefined && (typeof a.options !== "object" || a.options === null)) {
		throw new Error(`${path}.options must be an object`);
	}
}
