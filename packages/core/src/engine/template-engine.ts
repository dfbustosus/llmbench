import type { ChatMessage } from "@llmbench/types";

/**
 * Replace {{variableName}} placeholders in a template string
 * with values from the context object. Missing variables are left as-is.
 */
export function interpolate(template: string, context: Record<string, unknown>): string {
	if (!template.includes("{{")) return template;
	return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
		const value = context[key];
		return value !== undefined ? String(value) : match;
	});
}

/**
 * Interpolate all message contents with context variables.
 */
export function interpolateMessages(
	messages: ChatMessage[],
	context: Record<string, unknown>,
): ChatMessage[] {
	return messages.map((msg) => ({
		...msg,
		content: interpolate(msg.content, context),
	}));
}
