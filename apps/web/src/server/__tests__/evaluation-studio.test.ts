import { createProvider } from "@llmbench/core/providers";
import type { ProviderConfig, ProviderResponse, ScorerConfig } from "@llmbench/types";
import { appRouter } from "@/trpc/routers";
import { getDB, getRepos } from "@/trpc/server";
import { providerConfigFromRecord } from "../provider-config";
import { startEvaluationRun } from "../run-controller";

const mocks = vi.hoisted(() => ({
	providerGenerate: vi.fn(),
	engineExecute: vi.fn(),
}));

vi.mock("@llmbench/core/providers", () => ({
	createProvider: vi.fn(() => ({
		type: "openai",
		name: "Mock Provider",
		model: "mock-model",
		generate: mocks.providerGenerate,
	})),
}));

vi.mock("@llmbench/core/engine", () => ({
	CacheManager: class CacheManager {},
	EventPersister: class EventPersister {
		handler() {
			return () => undefined;
		}
	},
	EvaluationEngine: class EvaluationEngine {
		onEvent() {}

		execute = mocks.engineExecute;
	},
}));

const tokenUsage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
const exactMatchScorer: ScorerConfig = {
	id: "exact-match",
	name: "Exact Match",
	type: "exact-match",
};

function resetWebDb() {
	const webGlobals = globalThis as typeof globalThis & {
		__llmbenchDb?: unknown;
		__llmbenchRepos?: unknown;
		__llmbenchWebRunControllers?: unknown;
	};
	delete webGlobals.__llmbenchDb;
	delete webGlobals.__llmbenchRepos;
	delete webGlobals.__llmbenchWebRunControllers;
	process.env.LLMBENCH_DB_PATH = ":memory:";
}

function createCaller() {
	return appRouter.createCaller({ db: getDB() });
}

async function createProjectDataset(addTestCase = true) {
	const repos = getRepos();
	const project = await repos.project.create({ name: "Web Test Project" });
	const dataset = await repos.dataset.create({
		projectId: project.id,
		name: "Web Test Dataset",
	});
	const testCase = addTestCase
		? await repos.testCase.create({ datasetId: dataset.id, input: "ping", expected: "pong" })
		: undefined;

	return { repos, project, dataset, testCase };
}

function defaultRunInput(projectId: string, datasetId: string, providerIds?: string[]) {
	return {
		projectId,
		datasetId,
		providerIds,
		scorerConfigs: [exactMatchScorer],
		concurrency: 1,
		maxRetries: 0,
		timeoutMs: 5000,
		cacheEnabled: false,
	};
}

describe("providerConfigFromRecord", () => {
	beforeEach(() => {
		resetWebDb();
		vi.clearAllMocks();
	});

	it("strips persisted secrets and preserves safe provider config", () => {
		const config = providerConfigFromRecord({
			type: "openai",
			name: "OpenAI",
			model: "gpt-4o-mini",
			config: {
				apiKey: "stored-secret",
				baseUrl: "https://api.example.com/v1",
				temperature: 0.2,
				maxTokens: 64,
				responseFormat: { type: "json_object" },
				extra: {
					accessKeyId: "access-secret",
					secretAccessKey: "secret-key",
					sessionToken: "session-secret",
					region: "us-east-1",
				},
			},
		});

		expect(config).toMatchObject({
			type: "openai",
			name: "OpenAI",
			model: "gpt-4o-mini",
			baseUrl: "https://api.example.com/v1",
			temperature: 0.2,
			maxTokens: 64,
			responseFormat: { type: "json_object" },
			extra: { region: "us-east-1" },
		});
		expect(config.apiKey).toBeUndefined();
		expect(config.extra).not.toHaveProperty("accessKeyId");
		expect(config.extra).not.toHaveProperty("secretAccessKey");
		expect(config.extra).not.toHaveProperty("sessionToken");
	});
});

describe("providerRouter", () => {
	beforeEach(() => {
		resetWebDb();
		vi.clearAllMocks();
		mocks.providerGenerate.mockResolvedValue({
			output: '{"ok":true}',
			latencyMs: 12,
			tokenUsage,
		} satisfies ProviderResponse);
	});

	it("rejects duplicate provider names within a project", async () => {
		const { project } = await createProjectDataset(false);
		const caller = createCaller();

		await caller.provider.create({
			projectId: project.id,
			type: "openai",
			name: "Primary",
			model: "gpt-4o-mini",
		});

		await expect(
			caller.provider.create({
				projectId: project.id,
				type: "anthropic",
				name: "Primary",
				model: "claude-3-5-haiku-latest",
			}),
		).rejects.toThrow('Provider "Primary" already exists in this project');
	});

	it("does not persist API keys from create or update inputs", async () => {
		const { repos, project } = await createProjectDataset(false);
		const caller = createCaller();
		const unsafeCreateConfig = {
			baseUrl: "https://api.example.com/v1",
			temperature: 0.1,
			apiKey: "create-secret",
			extra: { secretAccessKey: "create-extra-secret" },
		} as unknown as { baseUrl: string; temperature: number };

		const created = await caller.provider.create({
			projectId: project.id,
			type: "openai",
			name: "Primary",
			model: "gpt-4o-mini",
			config: unsafeCreateConfig,
		});

		const storedAfterCreate = await repos.provider.findById(created.id);
		const createConfig = storedAfterCreate?.config as Record<string, unknown>;
		expect(createConfig.baseUrl).toBe("https://api.example.com/v1");
		expect(createConfig.apiKey).toBeUndefined();
		expect(createConfig.extra).toBeUndefined();

		const unsafeUpdateConfig = {
			baseUrl: "https://api2.example.com/v1",
			systemMessage: "Be concise.",
			apiKey: "update-secret",
		} as unknown as { baseUrl: string; systemMessage: string };

		await caller.provider.update({
			id: created.id,
			type: "openai",
			name: "Primary",
			model: "gpt-4o-mini",
			config: unsafeUpdateConfig,
		});

		const storedAfterUpdate = await repos.provider.findById(created.id);
		const updateConfig = storedAfterUpdate?.config as Record<string, unknown>;
		expect(updateConfig.baseUrl).toBe("https://api2.example.com/v1");
		expect(updateConfig.systemMessage).toBe("Be concise.");
		expect(updateConfig.apiKey).toBeUndefined();
	});

	it("rejects dashboard connection tests for custom providers", async () => {
		const { repos, project } = await createProjectDataset(false);
		const provider = await repos.provider.create({
			projectId: project.id,
			type: "custom",
			name: "Custom",
			model: "custom-v1",
		});

		await expect(createCaller().provider.testConnection({ id: provider.id })).rejects.toThrow(
			"Custom providers require SDK/CLI code",
		);
		expect(createProvider).not.toHaveBeenCalled();
	});

	it("reports provider response errors from connection tests", async () => {
		const { repos, project } = await createProjectDataset(false);
		const provider = await repos.provider.create({
			projectId: project.id,
			type: "openai",
			name: "OpenAI",
			model: "gpt-4o-mini",
			config: { apiKey: "stored-secret", baseUrl: "https://api.example.com/v1" },
		});
		mocks.providerGenerate.mockResolvedValue({
			output: "",
			latencyMs: 5,
			tokenUsage,
			error: "Bad credentials",
		} satisfies ProviderResponse);

		await expect(createCaller().provider.testConnection({ id: provider.id })).rejects.toThrow(
			"Bad credentials",
		);

		const passedConfig = vi.mocked(createProvider).mock.calls[0][0] as ProviderConfig;
		expect(passedConfig.apiKey).toBeUndefined();
		expect(passedConfig.baseUrl).toBe("https://api.example.com/v1");
	});
});

describe("startEvaluationRun", () => {
	beforeEach(() => {
		resetWebDb();
		vi.clearAllMocks();
		mocks.providerGenerate.mockResolvedValue({
			output: "pong",
			latencyMs: 1,
			tokenUsage,
		} satisfies ProviderResponse);
		mocks.engineExecute.mockResolvedValue(undefined);
	});

	it("rejects datasets with no test cases", async () => {
		const { project, dataset } = await createProjectDataset(false);

		await expect(startEvaluationRun(defaultRunInput(project.id, dataset.id))).rejects.toThrow(
			"Dataset has no test cases",
		);
	});

	it("rejects selected providers that do not all belong to the project", async () => {
		const { repos, project, dataset } = await createProjectDataset(true);
		const otherProject = await repos.project.create({ name: "Other Project" });
		const selectedProvider = await repos.provider.create({
			projectId: project.id,
			type: "openai",
			name: "Project Provider",
			model: "gpt-4o-mini",
		});
		const foreignProvider = await repos.provider.create({
			projectId: otherProject.id,
			type: "openai",
			name: "Foreign Provider",
			model: "gpt-4o-mini",
		});

		await expect(
			startEvaluationRun(
				defaultRunInput(project.id, dataset.id, [selectedProvider.id, foreignProvider.id]),
			),
		).rejects.toThrow("One or more selected providers were not found in this project");
	});

	it("rejects dashboard runs with custom providers", async () => {
		const { repos, project, dataset } = await createProjectDataset(true);
		const provider = await repos.provider.create({
			projectId: project.id,
			type: "custom",
			name: "Custom",
			model: "custom-v1",
		});

		await expect(
			startEvaluationRun(defaultRunInput(project.id, dataset.id, [provider.id])),
		).rejects.toThrow("Custom providers require SDK/CLI code");
	});

	it("persists selected provider IDs and run timeout config", async () => {
		const { repos, project, dataset } = await createProjectDataset(true);
		await repos.provider.create({
			projectId: project.id,
			type: "openai",
			name: "Unused Provider",
			model: "gpt-4o-mini",
		});
		const selectedProvider = await repos.provider.create({
			projectId: project.id,
			type: "openai",
			name: "Selected Provider",
			model: "gpt-4o-mini",
			config: { baseUrl: "https://api.example.com/v1" },
		});

		const run = await startEvaluationRun({
			...defaultRunInput(project.id, dataset.id, [selectedProvider.id]),
			timeoutMs: 12345,
			concurrency: 2,
			maxRetries: 1,
			tags: ["smoke"],
		});
		const storedRun = await repos.evalRun.findById(run.id);

		expect(storedRun?.config.providerIds).toEqual([selectedProvider.id]);
		expect(storedRun?.config.timeoutMs).toBe(12345);
		expect(storedRun?.config.concurrency).toBe(2);
		expect(storedRun?.config.maxRetries).toBe(1);
		expect(storedRun?.totalCases).toBe(1);
		expect(storedRun?.tags).toEqual(["source:web", "smoke"]);
		expect(mocks.engineExecute).toHaveBeenCalledOnce();
	});
});
