import type { ProviderConfig } from "@llmbench/types";
import { CancellationError } from "@llmbench/types";
import { describe, expect, it } from "vitest";
import { ConcurrencyManager } from "../engine/concurrency-manager.js";
import { RetryHandler } from "../engine/retry-handler.js";
import type { CustomGenerateFn } from "../providers/custom-provider.js";
import { evaluate } from "../sdk/evaluate.js";

// ── Helpers ──────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeCustomConfig(name: string): ProviderConfig {
	return { type: "custom", name, model: `fake-${name.toLowerCase()}` };
}

// ── ConcurrencyManager unit tests ───────────────────────────────────

describe("ConcurrencyManager with signal", () => {
	it("should reject queued tasks with CancellationError on abort", async () => {
		const manager = new ConcurrencyManager(1);
		const controller = new AbortController();

		// Fill the slot with a slow task
		const slowTask = manager.run(() => delay(200).then(() => "done"), controller.signal);

		// Queue a second task — it will wait
		const queuedTask = manager.run(() => Promise.resolve("queued"), controller.signal);

		// Abort while second task is queued
		controller.abort();

		await expect(queuedTask).rejects.toThrow(CancellationError);
		// The in-flight task should still complete
		await expect(slowTask).resolves.toBe("done");
	});

	it("should reject immediately if signal is already aborted", async () => {
		const manager = new ConcurrencyManager(1);
		const controller = new AbortController();
		controller.abort();

		await expect(manager.run(() => Promise.resolve("nope"), controller.signal)).rejects.toThrow(
			CancellationError,
		);
	});
});

// ── RetryHandler unit tests ─────────────────────────────────────────

describe("RetryHandler with signal", () => {
	it("should interrupt retry delay on abort", async () => {
		const handler = new RetryHandler(5, 5000, 30000);
		const controller = new AbortController();

		let attempt = 0;
		const fn = () => {
			attempt++;
			return Promise.reject(new Error("fail"));
		};

		// Abort after a short time — should not wait for the full 5s delay
		setTimeout(() => controller.abort(), 50);
		const start = performance.now();

		await expect(handler.execute(fn, controller.signal)).rejects.toThrow(CancellationError);

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(1000);
		expect(attempt).toBe(1);
	});
});

// ── EvaluationEngine / SDK cancellation tests ───────────────────────

describe("Cancellation via evaluate() SDK", () => {
	it("should cancel queued tasks and return cancelled status", async () => {
		const controller = new AbortController();
		const slowProvider: CustomGenerateFn = async () => {
			await delay(100);
			return {
				output: "answer",
				latencyMs: 100,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};
		};

		// Abort after the first task starts
		setTimeout(() => controller.abort(), 50);

		const result = await evaluate({
			testCases: [
				{ input: "q1", expected: "answer" },
				{ input: "q2", expected: "answer" },
				{ input: "q3", expected: "answer" },
				{ input: "q4", expected: "answer" },
			],
			providers: [makeCustomConfig("Slow")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["Slow", slowProvider]]),
			concurrency: 1,
			signal: controller.signal,
		});

		expect(result.status).toBe("cancelled");
		expect(result.summary.completedCases).toBeLessThan(4);
	});

	it("should return cancelled immediately with pre-aborted signal", async () => {
		const controller = new AbortController();
		controller.abort();

		let called = false;
		const neverCalledProvider: CustomGenerateFn = async () => {
			called = true;
			return {
				output: "nope",
				latencyMs: 0,
				tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
			};
		};

		const result = await evaluate({
			testCases: [{ input: "q1", expected: "answer" }],
			providers: [makeCustomConfig("Never")],
			scorers: [],
			customProviders: new Map([["Never", neverCalledProvider]]),
			signal: controller.signal,
		});

		expect(result.status).toBe("cancelled");
		expect(called).toBe(false);
	});

	it("should let in-flight tasks complete before reporting cancelled", async () => {
		const controller = new AbortController();
		let completedCount = 0;

		const provider: CustomGenerateFn = async () => {
			await delay(80);
			completedCount++;
			return {
				output: "answer",
				latencyMs: 80,
				tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
			};
		};

		// With concurrency=2, 4 tasks: first batch of 2 starts, then abort
		setTimeout(() => controller.abort(), 50);

		const result = await evaluate({
			testCases: [
				{ input: "q1", expected: "answer" },
				{ input: "q2", expected: "answer" },
				{ input: "q3", expected: "answer" },
				{ input: "q4", expected: "answer" },
			],
			providers: [makeCustomConfig("Fast")],
			scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
			customProviders: new Map([["Fast", provider]]),
			concurrency: 2,
			signal: controller.signal,
		});

		expect(result.status).toBe("cancelled");
		// The 2 in-flight tasks should have completed
		expect(completedCount).toBe(2);
		expect(result.summary.completedCases).toBe(2);
	});
});
