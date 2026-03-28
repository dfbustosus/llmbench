/**
 * Error codes for programmatic error handling.
 * Use with `instanceof` checks and `error.code` switch statements.
 */
export const ErrorCode = {
	// Config errors
	CONFIG_NOT_FOUND: "CONFIG_NOT_FOUND",
	CONFIG_INVALID: "CONFIG_INVALID",
	CONFIG_VALIDATION: "CONFIG_VALIDATION",

	// Provider errors
	PROVIDER_API_ERROR: "PROVIDER_API_ERROR",
	PROVIDER_AUTH_ERROR: "PROVIDER_AUTH_ERROR",
	PROVIDER_RATE_LIMIT: "PROVIDER_RATE_LIMIT",
	PROVIDER_NOT_FOUND: "PROVIDER_NOT_FOUND",
	PROVIDER_INVALID_CONFIG: "PROVIDER_INVALID_CONFIG",

	// Scorer errors
	SCORER_NOT_FOUND: "SCORER_NOT_FOUND",
	SCORER_INVALID_CONFIG: "SCORER_INVALID_CONFIG",
	SCORER_UNSUPPORTED_INLINE: "SCORER_UNSUPPORTED_INLINE",

	// Timeout
	TIMEOUT: "TIMEOUT",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Base error class for all LLMBench operational errors. */
export class LLMBenchError extends Error {
	readonly code: ErrorCode;

	constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "LLMBenchError";
		this.code = code;
	}
}

/** Configuration errors: missing files, invalid fields, validation failures. */
export class ConfigError extends LLMBenchError {
	readonly field?: string;

	constructor(code: ErrorCode, message: string, field?: string, options?: ErrorOptions) {
		super(code, message, options);
		this.name = "ConfigError";
		this.field = field;
	}
}

/** Provider API errors: HTTP failures, auth issues, rate limits. */
export class ProviderError extends LLMBenchError {
	readonly providerName: string;
	readonly providerType: string;
	readonly statusCode?: number;

	constructor(
		code: ErrorCode,
		message: string,
		details: { providerName: string; providerType: string; statusCode?: number },
		options?: ErrorOptions,
	) {
		super(code, message, options);
		this.name = "ProviderError";
		this.providerName = details.providerName;
		this.providerType = details.providerType;
		this.statusCode = details.statusCode;
	}

	/** Whether this error is transient and the operation should be retried. */
	get isRetryable(): boolean {
		return this.statusCode !== undefined && RETRYABLE_STATUS_CODES.has(this.statusCode);
	}
}

/** Scorer errors: unknown types, missing dependencies, unsupported usage. */
export class ScorerError extends LLMBenchError {
	readonly scorerType?: string;

	constructor(code: ErrorCode, message: string, scorerType?: string, options?: ErrorOptions) {
		super(code, message, options);
		this.name = "ScorerError";
		this.scorerType = scorerType;
	}
}

/** Timeout errors: operation exceeded time limit. */
export class TimeoutError extends LLMBenchError {
	readonly timeoutMs?: number;
	readonly providerName?: string;

	constructor(
		message: string,
		details?: { timeoutMs?: number; providerName?: string },
		options?: ErrorOptions,
	) {
		super(ErrorCode.TIMEOUT, message, options);
		this.name = "TimeoutError";
		this.timeoutMs = details?.timeoutMs;
		this.providerName = details?.providerName;
	}
}
