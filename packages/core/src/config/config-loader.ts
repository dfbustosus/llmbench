import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
	CacheConfig,
	CIGateConfig,
	LLMBenchConfig,
	ProviderConfig,
	ScorerConfig,
} from "@llmbench/types";
import { ConfigError, ErrorCode } from "@llmbench/types";
import { parse as parseYaml } from "yaml";

const JS_CONFIG_FILES = ["llmbench.config.ts", "llmbench.config.js", "llmbench.config.mjs"];
const YAML_CONFIG_FILES = ["llmbench.config.yaml", "llmbench.config.yml"];
const CONFIG_FILES = [...JS_CONFIG_FILES, ...YAML_CONFIG_FILES];

const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);

function isYamlFile(filePath: string): boolean {
	return YAML_EXTENSIONS.has(extname(filePath).toLowerCase());
}

export async function loadConfig(configPath?: string): Promise<LLMBenchConfig> {
	if (configPath) {
		return loadConfigFile(configPath);
	}

	const errors: string[] = [];

	for (const file of CONFIG_FILES) {
		const fullPath = resolve(process.cwd(), file);
		if (!existsSync(fullPath)) continue;

		try {
			return await loadConfigFile(fullPath);
		} catch (error) {
			errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	if (errors.length > 0) {
		throw new ConfigError(
			ErrorCode.CONFIG_NOT_FOUND,
			`Failed to load config:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
		);
	}

	throw new ConfigError(
		ErrorCode.CONFIG_NOT_FOUND,
		"No llmbench config found. Create llmbench.config.ts (or .yaml) or run 'llmbench init'.",
	);
}

async function loadConfigFile(filePath: string): Promise<LLMBenchConfig> {
	const absolutePath = resolve(filePath);
	if (!existsSync(absolutePath)) {
		throw new ConfigError(ErrorCode.CONFIG_NOT_FOUND, `Config file not found: ${absolutePath}`);
	}

	if (isYamlFile(absolutePath)) {
		return loadYamlConfig(absolutePath);
	}
	return importJsConfig(absolutePath);
}

function loadYamlConfig(absolutePath: string): LLMBenchConfig {
	const content = readFileSync(absolutePath, "utf-8");
	const config = parseYaml(content);
	validateConfig(config);
	return config;
}

async function importJsConfig(absolutePath: string): Promise<LLMBenchConfig> {
	const url = pathToFileURL(absolutePath).href;
	const mod = await import(url);
	const config = mod.default ?? mod.config ?? mod;

	validateConfig(config);
	return config;
}

export function validateConfig(config: unknown): asserts config is LLMBenchConfig {
	if (!config || typeof config !== "object") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "Config must be an object");
	}

	const c = config as Record<string, unknown>;

	if (typeof c.projectName !== "string" || !c.projectName.trim()) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			"Config must have a non-empty 'projectName' string",
		);
	}

	if (!Array.isArray(c.providers) || c.providers.length === 0) {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "Config must have at least one provider");
	}

	for (let i = 0; i < c.providers.length; i++) {
		validateProviderConfig(c.providers[i], i);
	}

	if (!Array.isArray(c.scorers) || c.scorers.length === 0) {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "Config must have at least one scorer");
	}

	for (let i = 0; i < c.scorers.length; i++) {
		validateScorerConfig(c.scorers[i], i);
	}

	if (c.gate !== undefined) {
		validateGateConfig(c.gate);
	}

	if (c.cache !== undefined) {
		validateCacheConfig(c.cache);
	}
}

function validateProviderConfig(
	provider: unknown,
	index: number,
): asserts provider is ProviderConfig {
	if (!provider || typeof provider !== "object") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, `providers[${index}] must be an object`);
	}

	const p = provider as Record<string, unknown>;
	const validTypes = [
		"openai",
		"azure-openai",
		"anthropic",
		"google",
		"mistral",
		"together",
		"bedrock",
		"ollama",
		"custom",
	];

	if (typeof p.type !== "string" || !validTypes.includes(p.type)) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`providers[${index}].type must be one of: ${validTypes.join(", ")}`,
		);
	}
	if (typeof p.name !== "string" || !p.name) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`providers[${index}].name must be a non-empty string`,
		);
	}
	if (typeof p.model !== "string" || !p.model) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`providers[${index}].model must be a non-empty string`,
		);
	}
	if (p.stream !== undefined && typeof p.stream !== "boolean") {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`providers[${index}].stream must be a boolean`,
		);
	}
	if (p.responseFormat !== undefined) {
		if (!p.responseFormat || typeof p.responseFormat !== "object") {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				`providers[${index}].responseFormat must be an object`,
			);
		}
		const rf = p.responseFormat as Record<string, unknown>;
		if (rf.type !== "json_object") {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				`providers[${index}].responseFormat.type must be "json_object"`,
			);
		}
	}
	if (p.tools !== undefined) {
		if (!Array.isArray(p.tools)) {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				`providers[${index}].tools must be an array`,
			);
		}
		for (let ti = 0; ti < p.tools.length; ti++) {
			const tool = p.tools[ti] as Record<string, unknown>;
			if (tool.type !== "function") {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`providers[${index}].tools[${ti}].type must be "function"`,
				);
			}
			const fn = tool.function as Record<string, unknown> | undefined;
			if (!fn || typeof fn.name !== "string" || !fn.name) {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`providers[${index}].tools[${ti}].function.name must be a non-empty string`,
				);
			}
		}
	}
	if (p.toolChoice !== undefined) {
		const valid = ["auto", "required", "none"];
		if (typeof p.toolChoice === "string") {
			if (!valid.includes(p.toolChoice)) {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`providers[${index}].toolChoice must be "auto", "required", "none", or an object`,
				);
			}
		} else if (typeof p.toolChoice === "object" && p.toolChoice !== null) {
			const tc = p.toolChoice as Record<string, unknown>;
			if (tc.type !== "function") {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`providers[${index}].toolChoice.type must be "function"`,
				);
			}
			const fn = tc.function as Record<string, unknown> | undefined;
			if (!fn || typeof fn.name !== "string" || !fn.name) {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`providers[${index}].toolChoice.function.name must be a non-empty string`,
				);
			}
		} else {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				`providers[${index}].toolChoice must be a string or object`,
			);
		}
	}
}

function validateScorerConfig(scorer: unknown, index: number): asserts scorer is ScorerConfig {
	if (!scorer || typeof scorer !== "object") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, `scorers[${index}] must be an object`);
	}

	const s = scorer as Record<string, unknown>;

	if (typeof s.id !== "string" || !s.id) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`scorers[${index}].id must be a non-empty string`,
		);
	}
	if (typeof s.name !== "string" || !s.name) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`scorers[${index}].name must be a non-empty string`,
		);
	}
	if (typeof s.type !== "string" || !s.type) {
		throw new ConfigError(
			ErrorCode.CONFIG_VALIDATION,
			`scorers[${index}].type must be a non-empty string`,
		);
	}
}

function validateGateConfig(gate: unknown): asserts gate is CIGateConfig {
	if (!gate || typeof gate !== "object") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "gate must be an object");
	}

	const g = gate as Record<string, unknown>;

	if (g.minScore !== undefined) {
		if (typeof g.minScore !== "number" || g.minScore < 0 || g.minScore > 1) {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"gate.minScore must be a number between 0 and 1",
			);
		}
	}
	if (g.maxFailureRate !== undefined) {
		if (typeof g.maxFailureRate !== "number" || g.maxFailureRate < 0 || g.maxFailureRate > 1) {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"gate.maxFailureRate must be a number between 0 and 1",
			);
		}
	}
	if (g.maxCost !== undefined) {
		if (typeof g.maxCost !== "number" || g.maxCost <= 0) {
			throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "gate.maxCost must be a positive number");
		}
	}
	if (g.maxLatencyMs !== undefined) {
		if (typeof g.maxLatencyMs !== "number" || g.maxLatencyMs <= 0) {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"gate.maxLatencyMs must be a positive number",
			);
		}
	}
	if (g.scorerThresholds !== undefined) {
		if (typeof g.scorerThresholds !== "object" || g.scorerThresholds === null) {
			throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "gate.scorerThresholds must be an object");
		}
		for (const [key, val] of Object.entries(g.scorerThresholds as Record<string, unknown>)) {
			if (typeof val !== "number" || val < 0 || val > 1) {
				throw new ConfigError(
					ErrorCode.CONFIG_VALIDATION,
					`gate.scorerThresholds["${key}"] must be a number between 0 and 1`,
				);
			}
		}
	}
}

function validateCacheConfig(cache: unknown): asserts cache is CacheConfig {
	if (!cache || typeof cache !== "object") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "cache must be an object");
	}

	const c = cache as Record<string, unknown>;

	if (c.enabled !== undefined && typeof c.enabled !== "boolean") {
		throw new ConfigError(ErrorCode.CONFIG_VALIDATION, "cache.enabled must be a boolean");
	}

	if (c.ttlHours !== undefined) {
		if (typeof c.ttlHours !== "number" || c.ttlHours <= 0) {
			throw new ConfigError(
				ErrorCode.CONFIG_VALIDATION,
				"cache.ttlHours must be a positive number",
			);
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
