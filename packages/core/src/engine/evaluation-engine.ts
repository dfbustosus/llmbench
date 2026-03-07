import type {
	CostRecordRepository,
	EvalResultRepository,
	EvalRunRepository,
	ScoreRepository,
} from "@llmbench/db";
import type {
	ChatMessage,
	EvalEvent,
	EvalRun,
	IProvider,
	IScorer,
	ProviderConfig,
	ScoreResult,
	TestCase,
} from "@llmbench/types";
import type { CostCalculator } from "../cost/cost-calculator.js";
import { ConcurrencyManager } from "./concurrency-manager.js";
import { EventBus } from "./event-bus.js";
import { RetryHandler } from "./retry-handler.js";
import { interpolate, interpolateMessages } from "./template-engine.js";

export interface EngineOptions {
	providers: Map<string, IProvider>;
	scorers: IScorer[];
	evalRunRepo: EvalRunRepository;
	evalResultRepo: EvalResultRepository;
	scoreRepo: ScoreRepository;
	costRecordRepo: CostRecordRepository;
	costCalculator: CostCalculator;
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

	constructor(options: EngineOptions) {
		this.providers = options.providers;
		this.scorers = options.scorers;
		this.evalRunRepo = options.evalRunRepo;
		this.evalResultRepo = options.evalResultRepo;
		this.scoreRepo = options.scoreRepo;
		this.costRecordRepo = options.costRecordRepo;
		this.costCalculator = options.costCalculator;
	}

	onEvent(handler: (event: EvalEvent) => void): () => void {
		return this.eventBus.on(handler);
	}

	async execute(run: EvalRun, testCases: TestCase[]): Promise<void> {
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
					this.eventBus.emit({
						type: "case:started",
						runId: run.id,
						testCaseId: testCase.id,
						providerId,
						timestamp: new Date().toISOString(),
					});

					try {
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

						const response = await retry.execute(() =>
							provider.generate(providerInput, configOverrides),
						);

						if (response.error) {
							throw new Error(response.error);
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
						});

						// Run scorers
						const scores: ScoreResult[] = [];
						for (const scorer of this.scorers) {
							const scoreResult = await scorer.score(
								response.output,
								testCase.expected,
								testCase.input,
							);
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
							scores: scores.map((s) => ({
								scorerName: s.scorerName,
								value: s.value,
							})),
							timestamp: new Date().toISOString(),
						});
					} catch (error) {
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
				});

				tasks.push(task);
			}
		}

		await Promise.all(tasks);

		const finalStatus: "completed" | "failed" = failedCases === totalCount ? "failed" : "completed";
		await this.evalRunRepo.updateStatus(run.id, finalStatus);

		if (finalStatus === "completed") {
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
