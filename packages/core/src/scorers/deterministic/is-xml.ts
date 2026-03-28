import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";

const XML_DECLARATION = /<\?xml[^?]*\?>/g;
const XML_COMMENT = /<!--[\s\S]*?-->/g;
const XML_TAG = /<(\/?)\s*([a-zA-Z][\w:.-]*)(?:\s[^>]*)?(\/?)>/g;

/**
 * Validates that the output is well-formed XML using stack-based tag matching.
 * Strips declarations and comments before checking. Handles self-closing tags.
 *
 * Deterministic — no LLM calls. Can be used as an inline assertion.
 */
export class IsXmlScorer implements IScorer {
	readonly id = "is-xml";
	readonly name = "Is XML";
	readonly type: ScorerType = "is-xml";

	async score(output: string, _expected: string): Promise<ScoreResult> {
		const trimmed = output.trim();
		if (trimmed.length === 0) {
			return this.fail("Output is empty");
		}

		if (!trimmed.includes("<")) {
			return this.fail("Output does not contain any XML tags");
		}

		// Strip declarations and comments
		const cleaned = trimmed.replace(XML_DECLARATION, "").replace(XML_COMMENT, "").trim();

		const stack: string[] = [];
		const matches = [...cleaned.matchAll(XML_TAG)];

		if (matches.length === 0) {
			return this.fail("No valid XML tags found");
		}

		for (const match of matches) {
			const isClosing = match[1] === "/";
			const tagName = match[2];
			const isSelfClosing = match[3] === "/";

			if (isSelfClosing) {
				continue;
			}

			if (isClosing) {
				if (stack.length === 0) {
					return this.fail(`Closing tag </${tagName}> without matching opening tag`);
				}
				const top = stack.pop();
				if (top !== tagName) {
					return this.fail(`Mismatched tags: expected </${top}>, found </${tagName}>`);
				}
			} else {
				stack.push(tagName);
			}
		}

		if (stack.length > 0) {
			return this.fail(`Unclosed tags: ${stack.join(", ")}`);
		}

		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 1,
			reason: "Output is well-formed XML",
		};
	}

	private fail(reason: string): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value: 0,
			reason,
		};
	}
}
