import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfig, validateConfig } from "../config/config-loader.js";

const TMP_DIR = resolve(import.meta.dirname, "__tmp_config_test__");

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

describe("YAML config loading", () => {
	it("should load a valid YAML config", async () => {
		const yaml = `
projectName: test-project
description: A test project

providers:
  - type: openai
    name: GPT-4o
    model: gpt-4o

scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match

defaults:
  concurrency: 3
  maxRetries: 2
  timeoutMs: 15000
`;
		const filePath = writeTmpFile("llmbench.config.yaml", yaml);
		const config = await loadConfig(filePath);

		expect(config.projectName).toBe("test-project");
		expect(config.description).toBe("A test project");
		expect(config.providers).toHaveLength(1);
		expect(config.providers[0].type).toBe("openai");
		expect(config.providers[0].model).toBe("gpt-4o");
		expect(config.scorers).toHaveLength(1);
		expect(config.scorers[0].type).toBe("exact-match");
		expect(config.defaults?.concurrency).toBe(3);
	});

	it("should load a .yml extension", async () => {
		const yaml = `
projectName: yml-project
providers:
  - type: anthropic
    name: Claude
    model: claude-sonnet-4-6
scorers:
  - id: contains
    name: Contains
    type: contains
`;
		const filePath = writeTmpFile("llmbench.config.yml", yaml);
		const config = await loadConfig(filePath);

		expect(config.projectName).toBe("yml-project");
		expect(config.providers[0].type).toBe("anthropic");
	});

	it("should reject YAML with missing projectName", async () => {
		const yaml = `
providers:
  - type: openai
    name: Test
    model: gpt-4o
scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
`;
		const filePath = writeTmpFile("bad.yaml", yaml);
		await expect(loadConfig(filePath)).rejects.toThrow("projectName");
	});

	it("should reject YAML with no providers", async () => {
		const yaml = `
projectName: no-providers
providers: []
scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
`;
		const filePath = writeTmpFile("no-providers.yaml", yaml);
		await expect(loadConfig(filePath)).rejects.toThrow("at least one provider");
	});

	it("should reject YAML with invalid provider type", async () => {
		const yaml = `
projectName: bad-type
providers:
  - type: azure
    name: Azure
    model: gpt-4
scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
`;
		const filePath = writeTmpFile("bad-type.yaml", yaml);
		await expect(loadConfig(filePath)).rejects.toThrow("type must be one of");
	});

	it("should load YAML config with responseFormat", async () => {
		const yaml = `
projectName: json-mode
providers:
  - type: openai
    name: GPT JSON
    model: gpt-4o
    responseFormat:
      type: json_object
scorers:
  - id: json-match
    name: JSON Match
    type: json-match
`;
		const filePath = writeTmpFile("json-mode.yaml", yaml);
		const config = await loadConfig(filePath);

		expect(config.providers[0].responseFormat).toEqual({ type: "json_object" });
	});

	it("should load YAML config with gate and cache sections", async () => {
		const yaml = `
projectName: full-config
providers:
  - type: openai
    name: GPT
    model: gpt-4o
scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
gate:
  minScore: 0.8
  maxFailureRate: 0.1
cache:
  enabled: true
  ttlHours: 24
`;
		const filePath = writeTmpFile("full.yaml", yaml);
		const config = await loadConfig(filePath);

		expect(config.gate?.minScore).toBe(0.8);
		expect(config.gate?.maxFailureRate).toBe(0.1);
		expect(config.cache?.enabled).toBe(true);
		expect(config.cache?.ttlHours).toBe(24);
	});
});

describe("validateConfig", () => {
	it("should accept a valid config object", () => {
		const config = {
			projectName: "test",
			providers: [{ type: "openai", name: "GPT", model: "gpt-4o" }],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).not.toThrow();
	});

	it("should reject null", () => {
		expect(() => validateConfig(null)).toThrow("must be an object");
	});

	it("should reject empty scorers", () => {
		const config = {
			projectName: "test",
			providers: [{ type: "openai", name: "GPT", model: "gpt-4o" }],
			scorers: [],
		};
		expect(() => validateConfig(config)).toThrow("at least one scorer");
	});

	it("should accept a provider with responseFormat", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					responseFormat: { type: "json_object" },
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).not.toThrow();
	});

	it("should reject invalid responseFormat type", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					responseFormat: { type: "invalid" },
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).toThrow("responseFormat.type");
	});

	it("should reject non-object responseFormat", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					responseFormat: "json",
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).toThrow("responseFormat must be an object");
	});

	it("should accept a provider with tools", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					tools: [
						{
							type: "function",
							function: { name: "get_weather", description: "Get weather" },
						},
					],
					toolChoice: "auto",
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).not.toThrow();
	});

	it("should reject tools with missing function name", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					tools: [{ type: "function", function: { name: "" } }],
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).toThrow("function.name must be a non-empty string");
	});

	it("should reject invalid toolChoice string", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					toolChoice: "invalid",
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).toThrow("toolChoice");
	});

	it("should accept toolChoice as specific function", () => {
		const config = {
			projectName: "test",
			providers: [
				{
					type: "openai",
					name: "GPT",
					model: "gpt-4o",
					toolChoice: { type: "function", function: { name: "get_weather" } },
				},
			],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
		};
		expect(() => validateConfig(config)).not.toThrow();
	});
});
