import type { IScorer, ScoreResult, ScorerType } from "@llmbench/types";
import Ajv from "ajv";

export interface JsonSchemaOptions {
	strict?: boolean;
}

export class JsonSchemaScorer implements IScorer {
	readonly id = "json-schema";
	readonly name = "JSON Schema";
	readonly type: ScorerType = "json-schema";
	private ajv: Ajv;

	constructor(options?: JsonSchemaOptions) {
		this.ajv = new Ajv({ strict: options?.strict ?? false, allErrors: true });
	}

	async score(output: string, expected: string): Promise<ScoreResult> {
		let data: unknown;
		try {
			data = JSON.parse(output);
		} catch {
			return this.result(0, ["Output is not valid JSON"]);
		}

		let schema: unknown;
		try {
			schema = JSON.parse(expected);
		} catch {
			return this.result(0, ["Expected value is not a valid JSON Schema"]);
		}

		let validate: ReturnType<Ajv["compile"]>;
		try {
			validate = this.ajv.compile(schema as Record<string, unknown>);
		} catch (e) {
			return this.result(0, [`Invalid JSON Schema: ${e instanceof Error ? e.message : String(e)}`]);
		}

		const valid = validate(data);

		if (valid) {
			return this.result(1, null);
		}

		const errors = (validate.errors ?? []).map(
			(err) => `${err.instancePath || "/"} ${err.message}`,
		);
		return this.result(0, errors);
	}

	private result(value: number, errors: string[] | null): ScoreResult {
		return {
			scorerId: this.id,
			scorerName: this.name,
			scorerType: this.type,
			value,
			reason: value === 1 ? "Output matches JSON Schema" : "Output does not match JSON Schema",
			metadata: errors ? { errors } : undefined,
		};
	}
}
