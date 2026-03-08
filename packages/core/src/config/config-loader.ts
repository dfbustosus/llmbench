import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { CIGateConfig, LLMBenchConfig, ProviderConfig, ScorerConfig } from "@llmbench/types";

const CONFIG_FILES = ["llmbench.config.ts", "llmbench.config.js", "llmbench.config.mjs"];

export async function loadConfig(configPath?: string): Promise<LLMBenchConfig> {
	if (configPath) {
		return importConfig(configPath);
	}

	const errors: string[] = [];

	for (const file of CONFIG_FILES) {
		const fullPath = resolve(process.cwd(), file);
		if (!existsSync(fullPath)) continue;

		try {
			return await importConfig(fullPath);
		} catch (error) {
			errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	if (errors.length > 0) {
		throw new Error(`Failed to load config:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
	}

	throw new Error("No llmbench config found. Create llmbench.config.ts or run 'llmbench init'.");
}

async function importConfig(filePath: string): Promise<LLMBenchConfig> {
	const absolutePath = resolve(filePath);
	if (!existsSync(absolutePath)) {
		throw new Error(`Config file not found: ${absolutePath}`);
	}

	const url = pathToFileURL(absolutePath).href;
	const mod = await import(url);
	const config = mod.default ?? mod.config ?? mod;

	validateConfig(config);
	return config;
}

export function validateConfig(config: unknown): asserts config is LLMBenchConfig {
	if (!config || typeof config !== "object") {
		throw new Error("Config must be an object");
	}

	const c = config as Record<string, unknown>;

	if (typeof c.projectName !== "string" || !c.projectName.trim()) {
		throw new Error("Config must have a non-empty 'projectName' string");
	}

	if (!Array.isArray(c.providers) || c.providers.length === 0) {
		throw new Error("Config must have at least one provider");
	}

	for (let i = 0; i < c.providers.length; i++) {
		validateProviderConfig(c.providers[i], i);
	}

	if (!Array.isArray(c.scorers) || c.scorers.length === 0) {
		throw new Error("Config must have at least one scorer");
	}

	for (let i = 0; i < c.scorers.length; i++) {
		validateScorerConfig(c.scorers[i], i);
	}

	if (c.gate !== undefined) {
		validateGateConfig(c.gate);
	}
}

function validateProviderConfig(
	provider: unknown,
	index: number,
): asserts provider is ProviderConfig {
	if (!provider || typeof provider !== "object") {
		throw new Error(`providers[${index}] must be an object`);
	}

	const p = provider as Record<string, unknown>;
	const validTypes = ["openai", "anthropic", "google", "ollama", "custom"];

	if (typeof p.type !== "string" || !validTypes.includes(p.type)) {
		throw new Error(`providers[${index}].type must be one of: ${validTypes.join(", ")}`);
	}
	if (typeof p.name !== "string" || !p.name) {
		throw new Error(`providers[${index}].name must be a non-empty string`);
	}
	if (typeof p.model !== "string" || !p.model) {
		throw new Error(`providers[${index}].model must be a non-empty string`);
	}
}

function validateScorerConfig(scorer: unknown, index: number): asserts scorer is ScorerConfig {
	if (!scorer || typeof scorer !== "object") {
		throw new Error(`scorers[${index}] must be an object`);
	}

	const s = scorer as Record<string, unknown>;

	if (typeof s.id !== "string" || !s.id) {
		throw new Error(`scorers[${index}].id must be a non-empty string`);
	}
	if (typeof s.name !== "string" || !s.name) {
		throw new Error(`scorers[${index}].name must be a non-empty string`);
	}
	if (typeof s.type !== "string" || !s.type) {
		throw new Error(`scorers[${index}].type must be a non-empty string`);
	}
}

function validateGateConfig(gate: unknown): asserts gate is CIGateConfig {
	if (!gate || typeof gate !== "object") {
		throw new Error("gate must be an object");
	}

	const g = gate as Record<string, unknown>;

	if (g.minScore !== undefined) {
		if (typeof g.minScore !== "number" || g.minScore < 0 || g.minScore > 1) {
			throw new Error("gate.minScore must be a number between 0 and 1");
		}
	}
	if (g.maxFailureRate !== undefined) {
		if (typeof g.maxFailureRate !== "number" || g.maxFailureRate < 0 || g.maxFailureRate > 1) {
			throw new Error("gate.maxFailureRate must be a number between 0 and 1");
		}
	}
	if (g.maxCost !== undefined) {
		if (typeof g.maxCost !== "number" || g.maxCost <= 0) {
			throw new Error("gate.maxCost must be a positive number");
		}
	}
	if (g.maxLatencyMs !== undefined) {
		if (typeof g.maxLatencyMs !== "number" || g.maxLatencyMs <= 0) {
			throw new Error("gate.maxLatencyMs must be a positive number");
		}
	}
	if (g.scorerThresholds !== undefined) {
		if (typeof g.scorerThresholds !== "object" || g.scorerThresholds === null) {
			throw new Error("gate.scorerThresholds must be an object");
		}
		for (const [key, val] of Object.entries(g.scorerThresholds as Record<string, unknown>)) {
			if (typeof val !== "number" || val < 0 || val > 1) {
				throw new Error(`gate.scorerThresholds["${key}"] must be a number between 0 and 1`);
			}
		}
	}
}

export const DEFAULT_CONFIG: Partial<LLMBenchConfig> = {
	dbPath: "./llmbench.db",
	port: 3000,
	defaults: {
		concurrency: 5,
		maxRetries: 3,
		timeoutMs: 30000,
	},
};

export function mergeWithDefaults(config: LLMBenchConfig): LLMBenchConfig {
	return {
		...DEFAULT_CONFIG,
		...config,
		defaults: {
			...DEFAULT_CONFIG.defaults,
			...config.defaults,
		},
	};
}
