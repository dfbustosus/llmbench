import { describe, expect, it } from "vitest";
import { interpolate, interpolateMessages } from "../engine/template-engine.js";

describe("interpolate", () => {
	it("should replace {{variable}} placeholders", () => {
		const result = interpolate("Hello {{name}}, you are {{age}} years old", {
			name: "Alice",
			age: 30,
		});
		expect(result).toBe("Hello Alice, you are 30 years old");
	});

	it("should leave unmatched placeholders as-is", () => {
		const result = interpolate("Hello {{name}}, {{missing}}", { name: "Alice" });
		expect(result).toBe("Hello Alice, {{missing}}");
	});

	it("should handle empty context", () => {
		const result = interpolate("Hello {{name}}", {});
		expect(result).toBe("Hello {{name}}");
	});

	it("should handle string with no placeholders", () => {
		const result = interpolate("Hello world", { name: "Alice" });
		expect(result).toBe("Hello world");
	});

	it("should convert non-string values to strings", () => {
		const result = interpolate("Count: {{n}}, Active: {{active}}", {
			n: 42,
			active: true,
		});
		expect(result).toBe("Count: 42, Active: true");
	});

	it("should handle undefined values by leaving placeholder", () => {
		const result = interpolate("Value: {{x}}", { x: undefined });
		expect(result).toBe("Value: {{x}}");
	});

	it("should handle multiple occurrences of the same variable", () => {
		const result = interpolate("{{x}} + {{x}} = {{y}}", { x: "1", y: "2" });
		expect(result).toBe("1 + 1 = 2");
	});
});

describe("interpolateMessages", () => {
	it("should interpolate all message contents", () => {
		const messages = [
			{ role: "system" as const, content: "You are a {{role}} assistant" },
			{ role: "user" as const, content: "Translate {{text}} to {{language}}" },
		];
		const result = interpolateMessages(messages, {
			role: "translation",
			text: "hello",
			language: "French",
		});
		expect(result).toEqual([
			{ role: "system", content: "You are a translation assistant" },
			{ role: "user", content: "Translate hello to French" },
		]);
	});

	it("should preserve message roles", () => {
		const messages = [
			{ role: "user" as const, content: "{{q}}" },
			{ role: "assistant" as const, content: "{{a}}" },
			{ role: "user" as const, content: "Follow up" },
		];
		const result = interpolateMessages(messages, {
			q: "What is AI?",
			a: "Artificial Intelligence",
		});
		expect(result[0].role).toBe("user");
		expect(result[1].role).toBe("assistant");
		expect(result[2].content).toBe("Follow up");
	});
});
