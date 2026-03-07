import type { IProvider, IScorer, ScoreResult, ScorerType } from "@llmbench/types";

function sanitizeForPrompt(text: string): string {
	return text.replace(/\{\{/g, "{ {").replace(/\}\}/g, "} }");
}

export class LLMJudgeScorer implements IScorer {
	readonly id = "llm-judge";
	readonly name: string;
	readonly type: ScorerType = "llm-judge";
	private provider: IProvider;
	private promptTemplate: string;

	constructor(provider: IProvider, options?: { name?: string; promptTemplate?: string }) {
		this.provider = provider;
		this.name = options?.name ?? "LLM Judge";
		this.promptTemplate =
			options?.promptTemplate ??
			`You are an evaluation judge. Score the following output on a scale of 0 to 1.

Input: {{input}}
Expected output: {{expected}}
Actual output: {{output}}

Respond with a JSON object with two fields:
- "score": a number between 0 and 1
- "reason": a brief explanation

Only respond with the JSON, nothing else.`;
	}

	async score(output: string, expected: string, input?: string): Promise<ScoreResult> {
		const prompt = this.promptTemplate
			.replace("{{input}}", sanitizeForPrompt(input ?? ""))
			.replace("{{expected}}", sanitizeForPrompt(expected))
			.replace("{{output}}", sanitizeForPrompt(output));

		try {
			const response = await this.provider.generate(prompt);

			if (response.error) {
				return {
					scorerId: this.id,
					scorerName: this.name,
					scorerType: this.type,
					value: 0,
					reason: `LLM judge error: ${response.error}`,
				};
			}

			let parsed: unknown;
			try {
				parsed = JSON.parse(response.output.trim());
			} catch {
				return {
					scorerId: this.id,
					scorerName: this.name,
					scorerType: this.type,
					value: 0,
					reason: `LLM judge returned invalid JSON: ${response.output.slice(0, 200)}`,
				};
			}

			if (
				!parsed ||
				typeof parsed !== "object" ||
				!("score" in parsed) ||
				typeof (parsed as Record<string, unknown>).score !== "number"
			) {
				return {
					scorerId: this.id,
					scorerName: this.name,
					scorerType: this.type,
					value: 0,
					reason: `LLM judge response missing valid "score" field`,
				};
			}

			const obj = parsed as { score: number; reason?: string };
			const score = Math.max(0, Math.min(1, obj.score));

			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: score,
				rawValue: obj.score,
				reason: typeof obj.reason === "string" ? obj.reason : "No reason provided",
				metadata: { rawJudgement: response.output },
			};
		} catch (error) {
			return {
				scorerId: this.id,
				scorerName: this.name,
				scorerType: this.type,
				value: 0,
				reason: `LLM judge failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}
}
