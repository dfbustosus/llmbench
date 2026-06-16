import { CostCalculator } from "@llmbench/core/cost";
import { CacheManager, EvaluationEngine, EventPersister } from "@llmbench/core/engine";
import { createProvider } from "@llmbench/core/providers";
import { type CreateScorerOptions, createScorer } from "@llmbench/core/scorers";
import {
	CacheRepository,
	CostRecordRepository,
	EvalResultRepository,
	EvalRunRepository,
	EventRepository,
	ScoreRepository,
} from "@llmbench/db";
import type { EvalEvent, EvalRun, IProvider, ProviderConfig, ScorerConfig } from "@llmbench/types";
import { getDB, getRepos } from "@/trpc/server";

const WEB_RUN_TAG = "source:web";

const globalForRuns = globalThis as unknown as {
	__llmbenchWebRunControllers?: Map<string, AbortController>;
};

function getRunControllers(): Map<string, AbortController> {
	if (!globalForRuns.__llmbenchWebRunControllers) {
		globalForRuns.__llmbenchWebRunControllers = new Map();
	}
	return globalForRuns.__llmbenchWebRunControllers;
}

export interface StartEvaluationRunInput {
	projectId: string;
	datasetId: string;
	providerIds?: string[];
	scorerConfigs: ScorerConfig[];
	concurrency: number;
	maxRetries: number;
	timeoutMs: number;
	cacheEnabled: boolean;
	ttlHours?: number;
	tags?: string[];
}

export interface CancelEvaluationRunResult {
	cancelled: boolean;
	managed: boolean;
}

function providerConfigFromRecord(record: {
	type: ProviderConfig["type"];
	name: string;
	model: string;
	config?: Partial<ProviderConfig>;
}): ProviderConfig {
	return {
		...record.config,
		type: record.type,
		name: record.name,
		model: record.model,
	};
}

function createRunFailedEvent(runId: string, error: unknown): EvalEvent {
	return {
		type: "run:failed",
		runId,
		error: error instanceof Error ? error.message : String(error),
		timestamp: new Date().toISOString(),
	};
}

function createRunCancelledEvent(run: EvalRun): EvalEvent {
	return {
		type: "run:cancelled",
		runId: run.id,
		completedCases: run.completedCases,
		totalCases: run.totalCases,
		failedCases: run.failedCases,
		timestamp: new Date().toISOString(),
	};
}

function persistEvent(eventRepo: EventRepository, event: EvalEvent): void {
	eventRepo.insert({
		runId: event.runId,
		eventType: event.type,
		payload: JSON.stringify(event),
		timestamp: event.timestamp,
	});
}

export async function startEvaluationRun(input: StartEvaluationRunInput): Promise<EvalRun> {
	const db = getDB();
	const repos = getRepos();

	const project = await repos.project.findById(input.projectId);
	if (!project) {
		throw new Error("Project not found");
	}

	const dataset = await repos.dataset.findById(input.datasetId);
	if (!dataset) {
		throw new Error("Dataset not found");
	}
	if (dataset.projectId !== input.projectId) {
		throw new Error("Dataset does not belong to this project");
	}

	const testCases = await repos.testCase.findByDatasetId(input.datasetId);
	if (testCases.length === 0) {
		throw new Error("Dataset has no test cases");
	}

	const projectProviders = await repos.provider.findByProjectId(input.projectId);
	const selectedProviderIds = input.providerIds?.length
		? new Set(input.providerIds)
		: new Set(projectProviders.map((provider) => provider.id));
	const selectedProviders = projectProviders.filter((provider) =>
		selectedProviderIds.has(provider.id),
	);

	if (selectedProviders.length === 0) {
		throw new Error("No providers selected. Add a provider from the dashboard Providers page.");
	}
	if (selectedProviders.length !== selectedProviderIds.size) {
		throw new Error("One or more selected providers were not found in this project");
	}
	if (selectedProviders.some((provider) => provider.type === "custom")) {
		throw new Error("Custom providers require SDK/CLI code and cannot run from the dashboard.");
	}

	const providerMap = new Map<string, IProvider>();
	const providersByName = new Map<string, IProvider>();
	const providerIds: string[] = [];

	for (const record of selectedProviders) {
		const providerConfig = providerConfigFromRecord(record);
		const provider = createProvider(providerConfig);
		providerIds.push(record.id);
		providerMap.set(record.id, provider);
		providersByName.set(record.name, provider);
	}

	const fallbackProvider = providersByName.values().next().value;
	const scorers = input.scorerConfigs.map((scorerConfig) => {
		const scorerOptions: CreateScorerOptions = {};
		const providerName = scorerConfig.options?.provider as string | undefined;
		if (providerName && providersByName.has(providerName)) {
			scorerOptions.provider = providersByName.get(providerName);
		} else if (fallbackProvider) {
			scorerOptions.provider = fallbackProvider;
		}
		return createScorer(scorerConfig, scorerOptions);
	});

	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const costRecordRepo = new CostRecordRepository(db);
	const eventRepo = new EventRepository(db);
	const cacheRepo = new CacheRepository(db);

	let cacheManager: CacheManager | undefined;
	if (input.cacheEnabled) {
		await cacheRepo.deleteExpired();
		cacheManager = new CacheManager(cacheRepo, { enabled: true, ttlHours: input.ttlHours });
	}

	const tags = [...new Set([WEB_RUN_TAG, ...(input.tags ?? [])])];
	const run = await evalRunRepo.create({
		projectId: input.projectId,
		datasetId: input.datasetId,
		config: {
			providerIds,
			scorerConfigs: input.scorerConfigs,
			concurrency: input.concurrency,
			maxRetries: input.maxRetries,
			timeoutMs: input.timeoutMs,
		},
		totalCases: testCases.length * providerIds.length,
		datasetVersion: dataset.version,
		tags,
	});

	const controller = new AbortController();
	getRunControllers().set(run.id, controller);

	const engine = new EvaluationEngine({
		providers: providerMap,
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
		cacheManager,
	});

	engine.onEvent(new EventPersister(eventRepo).handler());
	eventRepo.deleteStale();

	void engine
		.execute(run, testCases, controller.signal)
		.catch(async (error) => {
			const failedEvent = createRunFailedEvent(run.id, error);
			try {
				await evalRunRepo.updateStatus(run.id, "failed");
				persistEvent(eventRepo, failedEvent);
			} catch (persistError) {
				console.error(
					"[llmbench-web] Failed to mark run as failed:",
					persistError instanceof Error ? persistError.message : persistError,
				);
			}
			console.error(
				"[llmbench-web] Background evaluation failed:",
				error instanceof Error ? error.message : error,
			);
		})
		.finally(() => {
			getRunControllers().delete(run.id);
		});

	return run;
}

export async function cancelEvaluationRun(runId: string): Promise<CancelEvaluationRunResult> {
	const controllers = getRunControllers();
	const controller = controllers.get(runId);

	if (controller) {
		controller.abort();
		return { cancelled: true, managed: true };
	}

	const repos = getRepos();
	const run = await repos.evalRun.findById(runId);
	if (!run) {
		throw new Error("Run not found");
	}
	if (run.status !== "running" && run.status !== "pending") {
		throw new Error(`Cannot cancel run with status "${run.status}"`);
	}

	if (run.tags?.includes(WEB_RUN_TAG)) {
		await repos.evalRun.updateStatus(runId, "cancelled");
		persistEvent(new EventRepository(getDB()), createRunCancelledEvent(run));
		return { cancelled: true, managed: false };
	}

	throw new Error(
		"This run is not managed by the dashboard process. Stop the CLI process that started it to cancel execution.",
	);
}
