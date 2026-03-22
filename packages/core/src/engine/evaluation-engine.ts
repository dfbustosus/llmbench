import type {
	CostRecordRepository,
	EvalResultRepository,
	EvalRunRepository,
	ScoreRepository,
} from "@llmbench/db";
import {
	CancellationError,
	type ChatMessage,
	type EvalEvent,
	type EvalRun,
	type IProvider,
	type IScorer,
	type ProviderConfig,
	type ProviderResponse,
	type ScoreResult,
	type TestCase,
} from "@llmbench/types";
import type { CostCalculator } from "../cost/cost-calculator.js";
import type { CacheManager } from "./cache-manager.js";
import { ConcurrencyManager } from "./concurrency-manager.js";
import { EventBus } from "./event-bus.js";
import { RetryHandler } from "./retry-handler.js";
import { createScorerFromAssertion } from "./scorer-utils.js";
import { interpolate, interpolateMessages } from "./template-engine.js";

export interface EngineOptions {
	providers: Map<string, IProvider>;
	scorers: IScorer[];
	evalRunRepo: EvalRunRepository;
	evalResultRepo: EvalResultRepository;
	scoreRepo: ScoreRepository;
	costRecordRepo: CostRecordRepository;
	costCalculator: CostCalculator;
	cacheManager?: CacheManager;
}

export class EvaluationEngine {
	private eventBus = new EventBus();
	private providers: Map<string, IProvider>;
	private scorers: IScorer[];
	private evalRunRepo: EvalRunRepository;
	private evalResultRepo: EvalResultRepository;
	private scoreRepo: ScoreRepository;
	private costRecordRepo: CostRecordRepository;
	private costCalculator: CostCalculator;
	private cacheManager?: CacheManager;
	private cacheHits = 0;

	constructor(options: EngineOptions) {
		this.providers = options.providers;
		this.scorers = options.scorers;
		this.evalRunRepo = options.evalRunRepo;
		this.evalResultRepo = options.evalResultRepo;
		this.scoreRepo = options.scoreRepo;
		this.costRecordRepo = options.costRecordRepo;
		this.costCalculator = options.costCalculator;
		this.cacheManager = options.cacheManager;
	}

	getCacheHits(): number {
		return this.cacheHits;
	}

	onEvent(handler: (event: EvalEvent) => void): () => void {
		return this.eventBus.on(handler);
	}

	async execute(run: EvalRun, testCases: TestCase[], signal?: AbortSignal): Promise<void> {
		const config = run.config;
		const concurrency = new ConcurrencyManager(config.concurrency);
		const retry = new RetryHandler(config.maxRetries);
		const totalCount = testCases.length * config.providerIds.length;

		await this.evalRunRepo.updateStatus(run.id, "running");

		this.eventBus.emit({
			type: "run:started",
			runId: run.id,
			totalCases: totalCount,
			timestamp: new Date().toISOString(),
		});

		// Use atomic counters to avoid stale closure issues with concurrency
		let completedCases = 0;
		let failedCases = 0;
		let totalCost = 0;
		let totalTokens = 0;
		let totalLatency = 0;

		const tasks: Promise<void>[] = [];

		for (const testCase of testCases) {
			for (const providerId of config.providerIds) {
				if (signal?.aborted) {
					continue;
				}

				const provider = this.providers.get(providerId);
				if (!provider) {
					failedCases++;
					this.eventBus.emit({
						type: "case:failed",
						runId: run.id,
						testCaseId: testCase.id,
						providerId,
						error: `Provider "${providerId}" not found`,
						timestamp: new Date().toISOString(),
					});
					continue;
				}

				const task = concurrency.run(async () => {
					if (signal?.aborted) {
						throw new CancellationError();
					}
					this.eventBus.emit({
						type: "case:started",
						runId: run.id,
						testCaseId: testCase.id,
						providerId,
						timestamp: new Date().toISOString(),
					});

					try {
						// Pre-create scorers from assertions before any provider call
						// so invalid assertion types fail fast (no wasted API calls)
						let caseScorers: Array<{ scorer: IScorer; expected: string }>;
						if (testCase.assert && testCase.assert.length > 0) {
							caseScorers = testCase.assert.map((a) => ({
								scorer: createScorerFromAssertion(a),
								expected: a.value,
							}));
						} else {
							caseScorers = this.scorers.map((s) => ({
								scorer: s,
								expected: testCase.expected,
							}));
						}

						// Interpolate templates with test case context
						const context = testCase.context ?? {};
						const hasContext = Object.keys(context).length > 0;

						let providerInput: string | ChatMessage[];
						if (testCase.messages) {
							providerInput = hasContext
								? interpolateMessages(testCase.messages, context)
								: testCase.messages;
						} else {
							providerInput = hasContext ? interpolate(testCase.input, context) : testCase.input;
						}

						// Interpolate system message if provider has one and context exists
						let configOverrides: Partial<ProviderConfig> | undefined;
						if (hasContext && provider.systemMessage) {
							configOverrides = {
								systemMessage: interpolate(provider.systemMessage, context),
							};
						}

						// Include responseFormat in config so it becomes part of the cache key
						if (provider.responseFormat) {
							configOverrides = {
								...configOverrides,
								responseFormat: provider.responseFormat,
							};
						}

						// Include tools config in overrides for cache key differentiation
						if (provider.tools) {
							configOverrides = { ...configOverrides, tools: provider.tools };
						}
						if (provider.toolChoice) {
							configOverrides = { ...configOverrides, toolChoice: provider.toolChoice };
						}

						// Check cache before calling provider
						let response: ProviderResponse;
						let cached = false;

						if (this.cacheManager) {
							const cachedResponse = await this.cacheManager.get(
								providerId,
								provider.model,
								providerInput,
								configOverrides,
							);
							if (cachedResponse) {
								response = cachedResponse;
								cached = true;
								this.cacheHits++;
							} else {
								response = await retry.execute(
									() => provider.generate(providerInput, configOverrides),
									signal,
								);
								if (response.error) {
									throw new Error(response.error);
								}
								await this.cacheManager.set(
									providerId,
									provider.model,
									providerInput,
									configOverrides,
									response,
								);
							}
						} else {
							response = await retry.execute(
								() => provider.generate(providerInput, configOverrides),
								signal,
							);
							if (response.error) {
								throw new Error(response.error);
							}
						}

						// Calculate cost once
						const cost = this.costCalculator.calculate(
							provider.model,
							provider.type,
							response.tokenUsage,
						);

						// Save result
						const result = await this.evalResultRepo.create({
							runId: run.id,
							testCaseId: testCase.id,
							providerId,
							input: testCase.input,
							output: response.output,
							expected: testCase.expected,
							latencyMs: response.latencyMs,
							inputTokens: response.tokenUsage.inputTokens,
							outputTokens: response.tokenUsage.outputTokens,
							totalTokens: response.tokenUsage.totalTokens,
							cost: cost.totalCost,
							toolCalls: response.toolCalls,
						});

						// Run scorers (pre-created from assertions or global scorers)
						const scores: ScoreResult[] = [];
						for (const { scorer, expected } of caseScorers) {
							const scoreResult = await scorer.score(response.output, expected, testCase.input);
							scores.push(scoreResult);
						}

						// Save scores
						await this.scoreRepo.createMany(result.id, scores);

						// Save cost record
						await this.costRecordRepo.create({
							runId: run.id,
							providerId,
							model: provider.model,
							inputTokens: response.tokenUsage.inputTokens,
							outputTokens: response.tokenUsage.outputTokens,
							totalTokens: response.tokenUsage.totalTokens,
							inputCost: cost.inputCost,
							outputCost: cost.outputCost,
							totalCost: cost.totalCost,
						});

						// Update counters after all async work completes
						completedCases++;
						totalCost += cost.totalCost;
						totalTokens += response.tokenUsage.totalTokens;
						totalLatency += response.latencyMs;

						this.eventBus.emit({
							type: "case:completed",
							runId: run.id,
							testCaseId: testCase.id,
							providerId,
							latencyMs: response.latencyMs,
							cached,
							scores: scores.map((s) => ({
								scorerName: s.scorerName,
								value: s.value,
							})),
							timestamp: new Date().toISOString(),
						});
					} catch (error) {
						if (error instanceof CancellationError) {
							return;
						}

						failedCases++;

						// Save failed result
						await this.evalResultRepo.create({
							runId: run.id,
							testCaseId: testCase.id,
							providerId,
							input: testCase.input,
							output: "",
							expected: testCase.expected,
							error: error instanceof Error ? error.message : String(error),
							latencyMs: 0,
							inputTokens: 0,
							outputTokens: 0,
							totalTokens: 0,
						});

						this.eventBus.emit({
							type: "case:failed",
							runId: run.id,
							testCaseId: testCase.id,
							providerId,
							error: error instanceof Error ? error.message : String(error),
							timestamp: new Date().toISOString(),
						});
					}

					// Read counters after mutation for accurate progress
					const currentCompleted = completedCases;
					const currentFailed = failedCases;

					this.eventBus.emit({
						type: "run:progress",
						runId: run.id,
						completedCases: currentCompleted,
						totalCases: totalCount,
						failedCases: currentFailed,
						timestamp: new Date().toISOString(),
					});

					await this.evalRunRepo.updateProgress(run.id, {
						completedCases: currentCompleted,
						failedCases: currentFailed,
						totalCost,
						totalTokens,
						avgLatencyMs: currentCompleted > 0 ? totalLatency / currentCompleted : undefined,
					});
				}, signal);

				tasks.push(task);
			}
		}

		await Promise.allSettled(tasks);

		const finalStatus: "completed" | "failed" | "cancelled" = signal?.aborted
			? "cancelled"
			: failedCases === totalCount
				? "failed"
				: "completed";
		await this.evalRunRepo.updateStatus(run.id, finalStatus);

		if (finalStatus === "cancelled") {
			this.eventBus.emit({
				type: "run:cancelled",
				runId: run.id,
				completedCases,
				totalCases: totalCount,
				failedCases,
				timestamp: new Date().toISOString(),
			});
		} else if (finalStatus === "completed") {
			this.eventBus.emit({
				type: "run:completed",
				runId: run.id,
				totalCases: totalCount,
				failedCases,
				avgScore: 0,
				totalCost,
				timestamp: new Date().toISOString(),
			});
		} else {
			this.eventBus.emit({
				type: "run:failed",
				runId: run.id,
				error: `All ${totalCount} cases failed`,
				timestamp: new Date().toISOString(),
			});
		}
	}
}
