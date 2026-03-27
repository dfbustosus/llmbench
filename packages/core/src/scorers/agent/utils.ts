import type { ToolCall } from "@llmbench/types";

const MAX_TOOL_CALLS = 100;

/**
 * Extracts actual tool calls injected into scorer context by the engine.
 * The engine sets `context.toolCalls` from the provider response.
 */
export function extractToolCalls(context?: Record<string, unknown>): ToolCall[] {
	if (!context || !Array.isArray(context.toolCalls)) {
		return [];
	}
	return (context.toolCalls as unknown[])
		.filter((tc): tc is ToolCall => isValidToolCall(tc))
		.slice(0, MAX_TOOL_CALLS);
}

/**
 * Extracts expected tool calls from test case context.
 * Users provide these as `context.expectedToolCalls`.
 * More lenient than actual: `id` and `type` are optional.
 */
export function extractExpectedToolCalls(
	context?: Record<string, unknown>,
): Array<{ function: { name: string; arguments?: string } }> {
	if (!context || !Array.isArray(context.expectedToolCalls)) {
		return [];
	}
	return (context.expectedToolCalls as unknown[])
		.filter((tc): tc is { function: { name: string; arguments?: string } } => {
			if (!tc || typeof tc !== "object") return false;
			const obj = tc as Record<string, unknown>;
			if (!obj.function || typeof obj.function !== "object") return false;
			const fn = obj.function as Record<string, unknown>;
			return typeof fn.name === "string" && fn.name.length > 0;
		})
		.slice(0, MAX_TOOL_CALLS);
}

/**
 * Safely parses a JSON arguments string. Returns null on failure.
 */
export function parseArguments(argsString: string | undefined): unknown {
	if (!argsString || argsString.trim().length === 0) return null;
	try {
		return JSON.parse(argsString);
	} catch {
		return null;
	}
}

/**
 * Deep equality comparison for parsed JSON values.
 * Object key order insensitive. Handles nested objects, arrays, and primitives.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;

	if (Array.isArray(a)) {
		if (!Array.isArray(b) || a.length !== b.length) return false;
		return a.every((item, i) => deepEqual(item, b[i]));
	}

	if (typeof a === "object") {
		const aObj = a as Record<string, unknown>;
		const bObj = b as Record<string, unknown>;
		const aKeys = Object.keys(aObj);
		const bKeys = Object.keys(bObj);
		if (aKeys.length !== bKeys.length) return false;
		return aKeys.every((key) => key in bObj && deepEqual(aObj[key], bObj[key]));
	}

	return false;
}

function isValidToolCall(tc: unknown): boolean {
	if (!tc || typeof tc !== "object") return false;
	const obj = tc as Record<string, unknown>;
	if (!obj.function || typeof obj.function !== "object") return false;
	const fn = obj.function as Record<string, unknown>;
	return typeof fn.name === "string" && fn.name.length > 0;
}
