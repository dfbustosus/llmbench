import { describe, expect, it } from "vitest";
import { IsJsonScorer } from "../scorers/deterministic/is-json.js";
import { IsSqlScorer } from "../scorers/deterministic/is-sql.js";
import { IsValidFunctionCallScorer } from "../scorers/deterministic/is-valid-function-call.js";
import { IsXmlScorer } from "../scorers/deterministic/is-xml.js";
import { createScorer } from "../scorers/index.js";

// ── Is JSON ─────────────────────────────────────────────────────────

describe("IsJsonScorer", () => {
	const scorer = new IsJsonScorer();
	const strict = new IsJsonScorer({ strict: true });

	it("should return 1 for valid JSON object", async () => {
		const result = await scorer.score('{"a":1,"b":"two"}', "");
		expect(result.value).toBe(1);
	});

	it("should return 1 for valid JSON array", async () => {
		const result = await scorer.score("[1,2,3]", "");
		expect(result.value).toBe(1);
	});

	it("should return 1 for JSON primitive in non-strict mode", async () => {
		expect((await scorer.score('"hello"', "")).value).toBe(1);
		expect((await scorer.score("42", "")).value).toBe(1);
		expect((await scorer.score("true", "")).value).toBe(1);
		expect((await scorer.score("null", "")).value).toBe(1);
	});

	it("should return 0 for invalid JSON", async () => {
		expect((await scorer.score("not json", "")).value).toBe(0);
		expect((await scorer.score("{a:1}", "")).value).toBe(0);
		expect((await scorer.score("{'key': 'val'}", "")).value).toBe(0);
	});

	it("should return 0 for empty string", async () => {
		expect((await scorer.score("", "")).value).toBe(0);
	});

	it("should return 0 for whitespace only", async () => {
		expect((await scorer.score("   ", "")).value).toBe(0);
	});

	it("should handle JSON with whitespace padding", async () => {
		const result = await scorer.score('  {"a":1}  ', "");
		expect(result.value).toBe(1);
	});

	it("should return 0 for primitive in strict mode", async () => {
		expect((await strict.score('"hello"', "")).value).toBe(0);
		expect((await strict.score("42", "")).value).toBe(0);
		expect((await strict.score("null", "")).value).toBe(0);
		expect((await strict.score("true", "")).value).toBe(0);
	});

	it("should return 1 for object in strict mode", async () => {
		expect((await strict.score('{"a":1}', "")).value).toBe(1);
	});

	it("should return 1 for array in strict mode", async () => {
		expect((await strict.score("[1,2]", "")).value).toBe(1);
	});

	it("should include parse error in reason", async () => {
		const result = await scorer.score("{invalid", "");
		expect(result.reason).toContain("not valid JSON");
	});
});

// ── Is SQL ──────────────────────────────────────────────────────────

describe("IsSqlScorer", () => {
	const scorer = new IsSqlScorer();

	it("should return 1 for valid SELECT", async () => {
		expect((await scorer.score("SELECT * FROM users", "")).value).toBe(1);
	});

	it("should return 1 for SELECT with WHERE", async () => {
		expect((await scorer.score("SELECT id, name FROM users WHERE age > 18", "")).value).toBe(1);
	});

	it("should return 1 for INSERT", async () => {
		expect((await scorer.score("INSERT INTO users (name) VALUES ('Alice')", "")).value).toBe(1);
	});

	it("should return 1 for UPDATE", async () => {
		expect((await scorer.score("UPDATE users SET name = 'Bob' WHERE id = 1", "")).value).toBe(1);
	});

	it("should return 1 for DELETE", async () => {
		expect((await scorer.score("DELETE FROM users WHERE id = 1", "")).value).toBe(1);
	});

	it("should return 1 for CREATE TABLE", async () => {
		expect((await scorer.score("CREATE TABLE users (id INT, name TEXT)", "")).value).toBe(1);
	});

	it("should return 1 for WITH (CTE)", async () => {
		expect((await scorer.score("WITH cte AS (SELECT 1) SELECT * FROM cte", "")).value).toBe(1);
	});

	it("should return 1 for trailing semicolon", async () => {
		expect((await scorer.score("SELECT 1;", "")).value).toBe(1);
	});

	it("should return 1 for case-insensitive keywords", async () => {
		expect((await scorer.score("select * from users", "")).value).toBe(1);
	});

	it("should return 0 for empty string", async () => {
		expect((await scorer.score("", "")).value).toBe(0);
	});

	it("should return 0 for non-SQL text", async () => {
		expect((await scorer.score("Hello world", "")).value).toBe(0);
	});

	it("should return 0 for unbalanced parentheses", async () => {
		expect((await scorer.score("SELECT * FROM (users", "")).value).toBe(0);
		expect((await scorer.score("SELECT * FROM users)", "")).value).toBe(0);
	});

	it("should return 0 for unclosed string literal", async () => {
		expect((await scorer.score("SELECT * FROM users WHERE name = 'Alice", "")).value).toBe(0);
	});

	it("should return 1 for nested parentheses", async () => {
		expect(
			(await scorer.score("SELECT * FROM (SELECT id FROM (SELECT id FROM t))", "")).value,
		).toBe(1);
	});

	it("should return 0 for whitespace only", async () => {
		expect((await scorer.score("   ", "")).value).toBe(0);
	});
});

// ── Is XML ──────────────────────────────────────────────────────────

describe("IsXmlScorer", () => {
	const scorer = new IsXmlScorer();

	it("should return 1 for simple element", async () => {
		expect((await scorer.score("<root>text</root>", "")).value).toBe(1);
	});

	it("should return 1 for nested elements", async () => {
		expect((await scorer.score("<a><b>text</b></a>", "")).value).toBe(1);
	});

	it("should return 1 for self-closing tags", async () => {
		expect((await scorer.score("<root><br/></root>", "")).value).toBe(1);
	});

	it("should return 1 for XML with declaration", async () => {
		expect((await scorer.score('<?xml version="1.0"?><root>text</root>', "")).value).toBe(1);
	});

	it("should return 1 for XML with attributes", async () => {
		expect((await scorer.score('<root attr="val">text</root>', "")).value).toBe(1);
	});

	it("should return 0 for empty string", async () => {
		expect((await scorer.score("", "")).value).toBe(0);
	});

	it("should return 0 for plain text", async () => {
		expect((await scorer.score("Hello world", "")).value).toBe(0);
	});

	it("should return 0 for mismatched tags", async () => {
		const result = await scorer.score("<a></b>", "");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Mismatched");
	});

	it("should return 0 for unclosed tags", async () => {
		const result = await scorer.score("<root><child>", "");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("Unclosed");
	});

	it("should return 0 for whitespace only", async () => {
		expect((await scorer.score("   ", "")).value).toBe(0);
	});

	it("should return 1 for XML with comments", async () => {
		expect((await scorer.score("<!-- comment --><root/>", "")).value).toBe(1);
	});

	it("should return 1 for multiple nested levels", async () => {
		expect((await scorer.score("<a><b><c>text</c></b></a>", "")).value).toBe(1);
	});

	it("should return 0 for closing tag without opening", async () => {
		const result = await scorer.score("</root>", "");
		expect(result.value).toBe(0);
		expect(result.reason).toContain("without matching");
	});
});

// ── Is Valid Function Call ───────────────────────────────────────────

describe("IsValidFunctionCallScorer", () => {
	const scorer = new IsValidFunctionCallScorer();

	it("should return 1 for valid function call", async () => {
		const input = JSON.stringify({
			function: { name: "get_weather", arguments: '{"city":"London"}' },
		});
		const result = await scorer.score(input, "");
		expect(result.value).toBe(1);
		expect(result.metadata?.functionName).toBe("get_weather");
	});

	it("should return 0 for empty string", async () => {
		expect((await scorer.score("", "")).value).toBe(0);
	});

	it("should return 0 for non-JSON", async () => {
		expect((await scorer.score("not json", "")).value).toBe(0);
	});

	it("should return 0 for JSON without function property", async () => {
		expect((await scorer.score('{"name":"test"}', "")).value).toBe(0);
	});

	it("should return 0 for missing function.name", async () => {
		const input = JSON.stringify({ function: { arguments: "{}" } });
		expect((await scorer.score(input, "")).value).toBe(0);
	});

	it("should return 0 for empty function.name", async () => {
		const input = JSON.stringify({ function: { name: "", arguments: "{}" } });
		expect((await scorer.score(input, "")).value).toBe(0);
	});

	it("should return 0 for missing function.arguments", async () => {
		const input = JSON.stringify({ function: { name: "test" } });
		expect((await scorer.score(input, "")).value).toBe(0);
	});

	it("should return 0 for non-string function.arguments", async () => {
		const input = JSON.stringify({ function: { name: "test", arguments: 42 } });
		expect((await scorer.score(input, "")).value).toBe(0);
	});

	it("should return 0 for invalid JSON in function.arguments", async () => {
		const input = JSON.stringify({ function: { name: "test", arguments: "not json" } });
		expect((await scorer.score(input, "")).value).toBe(0);
	});

	it("should return 1 for function call with empty arguments object", async () => {
		const input = JSON.stringify({ function: { name: "test", arguments: "{}" } });
		expect((await scorer.score(input, "")).value).toBe(1);
	});

	it("should return 0 for JSON array", async () => {
		expect((await scorer.score("[1,2,3]", "")).value).toBe(0);
	});

	it("should return 0 for whitespace only", async () => {
		expect((await scorer.score("   ", "")).value).toBe(0);
	});
});

// ── Factory integration ─────────────────────────────────────────────

describe("createScorer with format validation types", () => {
	it("should create is-json scorer", () => {
		const scorer = createScorer({ id: "j", name: "J", type: "is-json" });
		expect(scorer.type).toBe("is-json");
	});

	it("should create is-json scorer with strict option", () => {
		const scorer = createScorer({
			id: "j",
			name: "J",
			type: "is-json",
			options: { strict: true },
		});
		expect(scorer.type).toBe("is-json");
	});

	it("should create is-sql scorer", () => {
		const scorer = createScorer({ id: "s", name: "S", type: "is-sql" });
		expect(scorer.type).toBe("is-sql");
	});

	it("should create is-xml scorer", () => {
		const scorer = createScorer({ id: "x", name: "X", type: "is-xml" });
		expect(scorer.type).toBe("is-xml");
	});

	it("should create is-valid-function-call scorer", () => {
		const scorer = createScorer({ id: "f", name: "F", type: "is-valid-function-call" });
		expect(scorer.type).toBe("is-valid-function-call");
	});
});
