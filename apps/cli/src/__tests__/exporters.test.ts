import type { ComparisonResult, EvalResult, EvalRun, ScoreResult } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import {
	escapeCsvField,
	exportCompareToCsv,
	exportEvalToCsv,
	exportRunToCsv,
	toCsvRow,
} from "../exporters/csv-exporter.js";
import {
	exportCompareToHtml,
	exportEvalToHtml,
	exportRunToHtml,
	htmlEscape,
	scoreClass,
} from "../exporters/html-exporter.js";
import type { CompareExportData, EvalExportData, RunExportData } from "../exporters/index.js";
import { detectFormat } from "../exporters/index.js";
import {
	exportCompareToJson,
	exportEvalToJson,
	exportRunToJson,
} from "../exporters/json-exporter.js";

// ── Mock fixtures ──────────────────────────────────────────────

const mockEvalResult: EvalResult = {
	id: "res-1",
	runId: "run-1",
	testCaseId: "tc-1",
	providerId: "prov-1",
	input: "What is 2+2?",
	output: "4",
	expected: "4",
	latencyMs: 150,
	tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
	cost: 0.0001,
	createdAt: "2024-01-01T00:00:00Z",
};

const mockEvalResultWithError: EvalResult = {
	id: "res-2",
	runId: "run-1",
	testCaseId: "tc-2",
	providerId: "prov-1",
	input: "Fail me",
	output: "",
	expected: "something",
	error: "Provider timeout",
	latencyMs: 0,
	tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
	createdAt: "2024-01-01T00:00:00Z",
};

const mockRun: EvalRun = {
	id: "run-1",
	projectId: "proj-1",
	datasetId: "ds-1",
	status: "completed",
	config: {
		providerIds: ["prov-1"],
		scorerConfigs: [],
		concurrency: 5,
		maxRetries: 3,
		timeoutMs: 30000,
	},
	totalCases: 2,
	completedCases: 1,
	failedCases: 1,
	totalCost: 0.0001,
	avgLatencyMs: 150,
	createdAt: "2024-01-01T00:00:00Z",
	updatedAt: "2024-01-01T00:00:01Z",
};

const mockScores = new Map<string, ScoreResult[]>([
	[
		"res-1",
		[
			{
				scorerId: "s1",
				scorerName: "Exact Match",
				scorerType: "exact-match",
				value: 1.0,
			},
			{
				scorerId: "s2",
				scorerName: "Contains",
				scorerType: "contains",
				value: 0.6,
			},
		],
	],
	["res-2", []],
]);

const mockRunData: RunExportData = {
	results: [mockEvalResult, mockEvalResultWithError],
	scores: mockScores,
	run: mockRun,
	scorerAverages: { "Exact Match": 1.0, Contains: 0.6 },
};

const mockComparisonResult: ComparisonResult = {
	runIdA: "run-a",
	runIdB: "run-b",
	scorerComparisons: [
		{
			scorerName: "Exact Match",
			avgScoreA: 0.8,
			avgScoreB: 0.9,
			delta: 0.1,
			percentChange: 12.5,
		},
	],
	costComparison: {
		totalCostA: 0.01,
		totalCostB: 0.02,
		delta: 0.01,
		percentChange: 100,
	},
	latencyComparison: {
		avgLatencyA: 200,
		avgLatencyB: 150,
		delta: -50,
		percentChange: -25,
	},
	regressions: [
		{
			testCaseId: "tc-abc-123",
			scorerName: "Contains",
			scoreA: 0.9,
			scoreB: 0.3,
			delta: -0.6,
			severity: "high",
		},
	],
};

const mockCompareData: CompareExportData = {
	result: mockComparisonResult,
};

const mockEvalData: EvalExportData = {
	prompt: "What is 2+2?",
	expected: "4",
	results: [
		{
			provider: "openai/gpt-4o",
			model: "gpt-4o",
			output: "4",
			latencyMs: 120,
			tokens: { input: 8, output: 3, total: 11 },
			cost: 0.00005,
			scores: [{ scorer: "exact-match", value: 1.0 }],
		},
		{
			provider: "anthropic/claude",
			model: "claude",
			output: "The answer is 4",
			latencyMs: 200,
			tokens: { input: 8, output: 6, total: 14 },
			cost: 0.00008,
			scores: [{ scorer: "exact-match", value: 0.0 }],
			error: undefined,
		},
	],
};

// ── Format detection ───────────────────────────────────────────

describe("detectFormat", () => {
	it("should detect .json", () => {
		expect(detectFormat("results.json")).toBe("json");
	});

	it("should detect .csv", () => {
		expect(detectFormat("results.csv")).toBe("csv");
	});

	it("should detect .html", () => {
		expect(detectFormat("report.html")).toBe("html");
	});

	it("should detect .htm", () => {
		expect(detectFormat("report.htm")).toBe("html");
	});

	it("should be case-insensitive", () => {
		expect(detectFormat("RESULTS.JSON")).toBe("json");
		expect(detectFormat("report.HTML")).toBe("html");
		expect(detectFormat("data.CSV")).toBe("csv");
	});

	it("should throw for unsupported extension", () => {
		expect(() => detectFormat("report.txt")).toThrow("Unsupported output format");
		expect(() => detectFormat("report.pdf")).toThrow("Unsupported output format");
	});
});

// ── CSV helpers ────────────────────────────────────────────────

describe("escapeCsvField", () => {
	it("should return plain strings unchanged", () => {
		expect(escapeCsvField("hello")).toBe("hello");
	});

	it("should wrap fields with commas in quotes", () => {
		expect(escapeCsvField("hello, world")).toBe('"hello, world"');
	});

	it("should double embedded quotes", () => {
		expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
	});

	it("should wrap fields with newlines in quotes", () => {
		expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
	});

	it("should handle null and undefined", () => {
		expect(escapeCsvField(null)).toBe("");
		expect(escapeCsvField(undefined)).toBe("");
	});

	it("should convert numbers to strings", () => {
		expect(escapeCsvField(42)).toBe("42");
	});
});

describe("toCsvRow", () => {
	it("should join fields with commas", () => {
		expect(toCsvRow(["a", "b", "c"])).toBe("a,b,c");
	});

	it("should escape fields that need it", () => {
		expect(toCsvRow(["hello", "a, b", "c"])).toBe('hello,"a, b",c');
	});
});

// ── CSV exporters ──────────────────────────────────────────────

describe("exportRunToCsv", () => {
	it("should produce valid CSV with headers and data", () => {
		const csv = exportRunToCsv(mockRunData);
		const lines = csv.split("\n");

		// First line is header
		expect(lines[0]).toContain("#");
		expect(lines[0]).toContain("Input");
		expect(lines[0]).toContain("Exact Match");
		expect(lines[0]).toContain("Contains");

		// Should have data rows
		expect(lines[1]).toContain("What is 2+2?");

		// Should have summary section
		expect(csv).toContain("Summary");
		expect(csv).toContain("completed");
	});

	it("should include scorer averages", () => {
		const csv = exportRunToCsv(mockRunData);
		expect(csv).toContain("Scorer Averages");
		expect(csv).toContain("Exact Match");
	});
});

describe("exportCompareToCsv", () => {
	it("should include score comparisons", () => {
		const csv = exportCompareToCsv(mockCompareData);
		expect(csv).toContain("Score Comparisons");
		expect(csv).toContain("Exact Match");
	});

	it("should include cost and latency sections", () => {
		const csv = exportCompareToCsv(mockCompareData);
		expect(csv).toContain("Cost Comparison");
		expect(csv).toContain("Latency Comparison");
	});

	it("should include regressions", () => {
		const csv = exportCompareToCsv(mockCompareData);
		expect(csv).toContain("Regressions");
		expect(csv).toContain("tc-abc-123");
		expect(csv).toContain("high");
	});
});

describe("exportEvalToCsv", () => {
	it("should include metadata header", () => {
		const csv = exportEvalToCsv(mockEvalData);
		expect(csv).toContain("Prompt");
		expect(csv).toContain("What is 2+2?");
		expect(csv).toContain("Expected");
	});

	it("should include provider columns", () => {
		const csv = exportEvalToCsv(mockEvalData);
		expect(csv).toContain("Provider");
		expect(csv).toContain("openai/gpt-4o");
		expect(csv).toContain("anthropic/claude");
	});

	it("should include dynamic scorer columns", () => {
		const csv = exportEvalToCsv(mockEvalData);
		expect(csv).toContain("exact-match");
	});
});

// ── JSON exporters ─────────────────────────────────────────────

describe("exportRunToJson", () => {
	it("should produce valid parseable JSON", () => {
		const json = exportRunToJson(mockRunData);
		const parsed = JSON.parse(json);
		expect(parsed).toBeDefined();
	});

	it("should convert Map to plain object with inline scores", () => {
		const json = exportRunToJson(mockRunData);
		const parsed = JSON.parse(json);
		expect(parsed.results[0].scores).toHaveLength(2);
		expect(parsed.results[0].scores[0].scorerName).toBe("Exact Match");
	});

	it("should include run and scorer averages", () => {
		const json = exportRunToJson(mockRunData);
		const parsed = JSON.parse(json);
		expect(parsed.run.id).toBe("run-1");
		expect(parsed.scorerAverages["Exact Match"]).toBe(1.0);
	});
});

describe("exportCompareToJson", () => {
	it("should produce valid parseable JSON", () => {
		const json = exportCompareToJson(mockCompareData);
		const parsed = JSON.parse(json);
		expect(parsed.runIdA).toBe("run-a");
		expect(parsed.runIdB).toBe("run-b");
	});

	it("should include all comparison sections", () => {
		const json = exportCompareToJson(mockCompareData);
		const parsed = JSON.parse(json);
		expect(parsed.scorerComparisons).toHaveLength(1);
		expect(parsed.costComparison).toBeDefined();
		expect(parsed.latencyComparison).toBeDefined();
		expect(parsed.regressions).toHaveLength(1);
	});
});

describe("exportEvalToJson", () => {
	it("should produce valid parseable JSON", () => {
		const json = exportEvalToJson(mockEvalData);
		const parsed = JSON.parse(json);
		expect(parsed.prompt).toBe("What is 2+2?");
		expect(parsed.expected).toBe("4");
		expect(parsed.results).toHaveLength(2);
	});

	it("should include scores when present", () => {
		const json = exportEvalToJson(mockEvalData);
		const parsed = JSON.parse(json);
		expect(parsed.results[0].scores).toHaveLength(1);
	});
});

// ── HTML exporters ─────────────────────────────────────────────

describe("htmlEscape", () => {
	it("should escape & < > characters", () => {
		expect(htmlEscape("a & b")).toBe("a &amp; b");
		expect(htmlEscape("<script>")).toBe("&lt;script&gt;");
	});

	it("should escape double quotes", () => {
		expect(htmlEscape('say "hi"')).toBe("say &quot;hi&quot;");
	});
});

describe("scoreClass", () => {
	it("should return score-high for >= 0.8", () => {
		expect(scoreClass(0.8)).toBe("score-high");
		expect(scoreClass(1.0)).toBe("score-high");
	});

	it("should return score-mid for >= 0.5 and < 0.8", () => {
		expect(scoreClass(0.5)).toBe("score-mid");
		expect(scoreClass(0.7)).toBe("score-mid");
	});

	it("should return score-low for < 0.5", () => {
		expect(scoreClass(0.0)).toBe("score-low");
		expect(scoreClass(0.49)).toBe("score-low");
	});
});

describe("exportRunToHtml", () => {
	it("should produce a complete HTML document", () => {
		const html = exportRunToHtml(mockRunData);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("should include inline CSS with no external links", () => {
		const html = exportRunToHtml(mockRunData);
		expect(html).toContain("<style>");
		expect(html).not.toContain('rel="stylesheet"');
		expect(html).not.toContain("href=");
	});

	it("should include summary stats", () => {
		const html = exportRunToHtml(mockRunData);
		expect(html).toContain("completed");
		expect(html).toContain("Total Cases");
	});

	it("should include score classes", () => {
		const html = exportRunToHtml(mockRunData);
		expect(html).toContain("score-high");
		expect(html).toContain("score-mid");
	});

	it("should include scorer average badges", () => {
		const html = exportRunToHtml(mockRunData);
		expect(html).toContain("Scorer Averages");
		expect(html).toContain("Exact Match");
	});
});

describe("exportCompareToHtml", () => {
	it("should produce a complete HTML document", () => {
		const html = exportCompareToHtml(mockCompareData);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("should include run IDs", () => {
		const html = exportCompareToHtml(mockCompareData);
		expect(html).toContain("run-a");
		expect(html).toContain("run-b");
	});

	it("should include delta classes", () => {
		const html = exportCompareToHtml(mockCompareData);
		expect(html).toContain("delta-pos");
	});

	it("should include regressions with severity", () => {
		const html = exportCompareToHtml(mockCompareData);
		expect(html).toContain("Regressions");
		expect(html).toContain("severity-high");
	});
});

describe("exportEvalToHtml", () => {
	it("should produce a complete HTML document", () => {
		const html = exportEvalToHtml(mockEvalData);
		expect(html).toContain("<!DOCTYPE html>");
		expect(html).toContain("</html>");
	});

	it("should include prompt in pre block", () => {
		const html = exportEvalToHtml(mockEvalData);
		expect(html).toContain("<pre>");
		expect(html).toContain("What is 2+2?");
	});

	it("should include expected output", () => {
		const html = exportEvalToHtml(mockEvalData);
		expect(html).toContain("Expected");
	});

	it("should include results table with providers", () => {
		const html = exportEvalToHtml(mockEvalData);
		expect(html).toContain("openai/gpt-4o");
		expect(html).toContain("anthropic/claude");
	});
});
