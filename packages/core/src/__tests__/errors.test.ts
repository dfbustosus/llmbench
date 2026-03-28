import {
	ConfigError,
	ErrorCode,
	LLMBenchError,
	ProviderError,
	ScorerError,
	TimeoutError,
} from "@llmbench/types";
import { describe, expect, it, vi } from "vitest";
import { RetryHandler } from "../engine/retry-handler.js";

// ── Error class basics ──────────────────────────────────────────────

describe("LLMBenchError", () => {
	it("should extend Error", () => {
		const err = new LLMBenchError(ErrorCode.CONFIG_INVALID, "test");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LLMBenchError);
	});

	it("should have correct name and code", () => {
		const err = new LLMBenchError(ErrorCode.CONFIG_INVALID, "test");
		expect(err.name).toBe("LLMBenchError");
		expect(err.code).toBe("CONFIG_INVALID");
		expect(err.message).toBe("test");
	});

	it("should support cause chaining", () => {
		const cause = new Error("root cause");
		const err = new LLMBenchError(ErrorCode.CONFIG_INVALID, "wrapped", { cause });
		expect(err.cause).toBe(cause);
	});
});

describe("ConfigError", () => {
	it("should extend LLMBenchError and Error", () => {
		const err = new ConfigError(ErrorCode.CONFIG_NOT_FOUND, "not found");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LLMBenchError);
		expect(err).toBeInstanceOf(ConfigError);
	});

	it("should have correct name", () => {
		const err = new ConfigError(ErrorCode.CONFIG_VALIDATION, "bad field");
		expect(err.name).toBe("ConfigError");
	});

	it("should carry field when provided", () => {
		const err = new ConfigError(ErrorCode.CONFIG_VALIDATION, "bad", "providers[0].type");
		expect(err.field).toBe("providers[0].type");
	});

	it("should have undefined field when not provided", () => {
		const err = new ConfigError(ErrorCode.CONFIG_NOT_FOUND, "not found");
		expect(err.field).toBeUndefined();
	});
});

describe("ProviderError", () => {
	it("should extend LLMBenchError and Error", () => {
		const err = new ProviderError(ErrorCode.PROVIDER_API_ERROR, "fail", {
			providerName: "GPT",
			providerType: "openai",
			statusCode: 500,
		});
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LLMBenchError);
		expect(err).toBeInstanceOf(ProviderError);
	});

	it("should have correct name and details", () => {
		const err = new ProviderError(ErrorCode.PROVIDER_RATE_LIMIT, "rate limited", {
			providerName: "GPT",
			providerType: "openai",
			statusCode: 429,
		});
		expect(err.name).toBe("ProviderError");
		expect(err.providerName).toBe("GPT");
		expect(err.providerType).toBe("openai");
		expect(err.statusCode).toBe(429);
	});

	it("should return isRetryable=true for 429", () => {
		const err = new ProviderError(ErrorCode.PROVIDER_RATE_LIMIT, "rate", {
			providerName: "P",
			providerType: "openai",
			statusCode: 429,
		});
		expect(err.isRetryable).toBe(true);
	});

	it("should return isRetryable=true for 500, 502, 503, 504", () => {
		for (const code of [500, 502, 503, 504]) {
			const err = new ProviderError(ErrorCode.PROVIDER_API_ERROR, "err", {
				providerName: "P",
				providerType: "openai",
				statusCode: code,
			});
			expect(err.isRetryable).toBe(true);
		}
	});

	it("should return isRetryable=false for 400, 401, 403, 404", () => {
		for (const code of [400, 401, 403, 404]) {
			const err = new ProviderError(ErrorCode.PROVIDER_API_ERROR, "err", {
				providerName: "P",
				providerType: "openai",
				statusCode: code,
			});
			expect(err.isRetryable).toBe(false);
		}
	});

	it("should return isRetryable=false when statusCode is undefined", () => {
		const err = new ProviderError(ErrorCode.PROVIDER_AUTH_ERROR, "no key", {
			providerName: "P",
			providerType: "openai",
		});
		expect(err.isRetryable).toBe(false);
	});
});

describe("ScorerError", () => {
	it("should extend LLMBenchError and Error", () => {
		const err = new ScorerError(ErrorCode.SCORER_NOT_FOUND, "unknown");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LLMBenchError);
		expect(err).toBeInstanceOf(ScorerError);
	});

	it("should carry scorerType", () => {
		const err = new ScorerError(ErrorCode.SCORER_NOT_FOUND, "unknown", "bad-type");
		expect(err.name).toBe("ScorerError");
		expect(err.scorerType).toBe("bad-type");
	});
});

describe("TimeoutError", () => {
	it("should extend LLMBenchError and Error", () => {
		const err = new TimeoutError("timed out");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(LLMBenchError);
		expect(err).toBeInstanceOf(TimeoutError);
	});

	it("should have TIMEOUT code", () => {
		const err = new TimeoutError("timed out");
		expect(err.code).toBe("TIMEOUT");
		expect(err.name).toBe("TimeoutError");
	});

	it("should carry timeout details", () => {
		const err = new TimeoutError("timed out", { timeoutMs: 30000, providerName: "GPT" });
		expect(err.timeoutMs).toBe(30000);
		expect(err.providerName).toBe("GPT");
	});
});

// ── RetryHandler with typed errors ──────────────────────────────────

describe("RetryHandler with typed errors", () => {
	it("should NOT retry ConfigError", async () => {
		const fn = vi.fn().mockRejectedValue(new ConfigError(ErrorCode.CONFIG_VALIDATION, "bad"));
		const handler = new RetryHandler(3);
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(ConfigError);
		expect(fn).toHaveBeenCalledTimes(1); // No retries
	});

	it("should NOT retry ScorerError", async () => {
		const fn = vi.fn().mockRejectedValue(new ScorerError(ErrorCode.SCORER_NOT_FOUND, "missing"));
		const handler = new RetryHandler(3);
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(ScorerError);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should NOT retry ProviderError with 401", async () => {
		const err = new ProviderError(ErrorCode.PROVIDER_AUTH_ERROR, "unauthorized", {
			providerName: "GPT",
			providerType: "openai",
			statusCode: 401,
		});
		const fn = vi.fn().mockRejectedValue(err);
		const handler = new RetryHandler(3);
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(ProviderError);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("should retry ProviderError with 429", async () => {
		const err = new ProviderError(ErrorCode.PROVIDER_RATE_LIMIT, "rate limited", {
			providerName: "GPT",
			providerType: "openai",
			statusCode: 429,
		});
		const fn = vi.fn().mockRejectedValue(err);
		const handler = new RetryHandler(2, 1, 10); // Short delays for test speed
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(ProviderError);
		expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
	});

	it("should retry plain Error (backward compat)", async () => {
		const fn = vi.fn().mockRejectedValue(new Error("unknown"));
		const handler = new RetryHandler(1, 1, 10);
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(Error);
		expect(fn).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
	});

	it("should retry TimeoutError", async () => {
		const fn = vi.fn().mockRejectedValue(new TimeoutError("timed out"));
		const handler = new RetryHandler(1, 1, 10);
		await expect(handler.execute(fn)).rejects.toBeInstanceOf(TimeoutError);
		expect(fn).toHaveBeenCalledTimes(2);
	});
});
