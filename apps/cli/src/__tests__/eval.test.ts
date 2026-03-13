import { describe, expect, it } from "vitest";
import { parseProviderShorthand, parseScorerShorthand } from "../commands/eval.js";

describe("parseProviderShorthand", () => {
	it("should parse openai provider", () => {
		const result = parseProviderShorthand("openai:gpt-4o");
		expect(result).toEqual({
			type: "openai",
			name: "openai/gpt-4o",
			model: "gpt-4o",
		});
	});

	it("should parse anthropic provider", () => {
		const result = parseProviderShorthand("anthropic:claude-sonnet-4-6");
		expect(result).toEqual({
			type: "anthropic",
			name: "anthropic/claude-sonnet-4-6",
			model: "claude-sonnet-4-6",
		});
	});

	it("should parse ollama provider", () => {
		const result = parseProviderShorthand("ollama:llama3.2");
		expect(result).toEqual({
			type: "ollama",
			name: "ollama/llama3.2",
			model: "llama3.2",
		});
	});

	it("should parse google provider", () => {
		const result = parseProviderShorthand("google:gemini-2.5-pro");
		expect(result).toEqual({
			type: "google",
			name: "google/gemini-2.5-pro",
			model: "gemini-2.5-pro",
		});
	});

	it("should handle model names with colons", () => {
		const result = parseProviderShorthand("ollama:some:model:name");
		expect(result).toEqual({
			type: "ollama",
			name: "ollama/some:model:name",
			model: "some:model:name",
		});
	});

	it("should throw for missing colon", () => {
		expect(() => parseProviderShorthand("openai")).toThrow(
			'Invalid provider format: "openai". Expected "type:model"',
		);
	});

	it("should throw for empty model", () => {
		expect(() => parseProviderShorthand("openai:")).toThrow(
			'Invalid provider format: "openai:". Both type and model are required',
		);
	});

	it("should throw for empty type", () => {
		expect(() => parseProviderShorthand(":gpt-4o")).toThrow(
			'Invalid provider format: ":gpt-4o". Both type and model are required',
		);
	});

	it("should throw for unknown provider type", () => {
		expect(() => parseProviderShorthand("azure:gpt-4")).toThrow('Unknown provider type: "azure"');
	});
});

describe("parseScorerShorthand", () => {
	it("should parse exact-match", () => {
		const result = parseScorerShorthand("exact-match");
		expect(result).toEqual({
			id: "exact-match",
			name: "Exact Match",
			type: "exact-match",
		});
	});

	it("should parse contains", () => {
		const result = parseScorerShorthand("contains");
		expect(result).toEqual({
			id: "contains",
			name: "Contains",
			type: "contains",
		});
	});

	it("should parse cosine-similarity", () => {
		const result = parseScorerShorthand("cosine-similarity");
		expect(result).toEqual({
			id: "cosine-similarity",
			name: "Cosine Similarity",
			type: "cosine-similarity",
		});
	});

	it("should parse json-match", () => {
		const result = parseScorerShorthand("json-match");
		expect(result).toEqual({
			id: "json-match",
			name: "Json Match",
			type: "json-match",
		});
	});

	it("should throw for unknown scorer type", () => {
		expect(() => parseScorerShorthand("bleu-score")).toThrow('Unknown scorer type: "bleu-score"');
	});
});
