import { createProvider } from "@llmbench/core/providers";
import type { ProviderConfig, ProviderType } from "@llmbench/types";
import { z } from "zod";
import { providerConfigFromRecord } from "@/server/provider-config";
import { getRepos, publicProcedure, router } from "../server";

const CONNECTION_TEST_PROMPT = "Return a short JSON object with ok set to true.";
const CONNECTION_TEST_MAX_TOKENS = 32;
const CONNECTION_TEST_TIMEOUT_MS = 10_000;

const dashboardProviderTypes = [
	"openai",
	"azure-openai",
	"anthropic",
	"google",
	"mistral",
	"together",
	"bedrock",
	"ollama",
] as const;

const providerConfigInput = z.object({
	baseUrl: z.string().trim().optional(),
	systemMessage: z.string().trim().optional(),
	temperature: z.number().min(0).max(2).optional(),
	maxTokens: z.number().int().positive().optional(),
	topP: z.number().min(0).max(1).optional(),
	stream: z.boolean().optional(),
	jsonMode: z.boolean().optional(),
});

function cleanOptionalString(value: string | undefined): string | undefined {
	return value && value.length > 0 ? value : undefined;
}

function toProviderConfig(input: {
	type: ProviderType;
	name: string;
	model: string;
	config?: z.infer<typeof providerConfigInput>;
}): ProviderConfig {
	const config = input.config;
	return {
		type: input.type,
		name: input.name,
		model: input.model,
		baseUrl: cleanOptionalString(config?.baseUrl),
		systemMessage: cleanOptionalString(config?.systemMessage),
		temperature: config?.temperature,
		maxTokens: config?.maxTokens,
		topP: config?.topP,
		stream: config?.stream,
		responseFormat: config?.jsonMode ? { type: "json_object" } : undefined,
	};
}

export const providerRouter = router({
	listByProject: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().provider.findByProjectId(input);
	}),

	create: publicProcedure
		.input(
			z.object({
				projectId: z.string(),
				type: z.enum(dashboardProviderTypes),
				name: z.string().trim().min(1),
				model: z.string().trim().min(1),
				config: providerConfigInput.optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const repos = getRepos();
			const existing = await repos.provider.findByProjectAndName(input.projectId, input.name);
			if (existing) {
				throw new Error(`Provider "${input.name}" already exists in this project`);
			}

			const config = toProviderConfig(input);
			return repos.provider.create({
				projectId: input.projectId,
				type: input.type,
				name: input.name,
				model: input.model,
				config,
			});
		}),

	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				type: z.enum(dashboardProviderTypes),
				name: z.string().trim().min(1),
				model: z.string().trim().min(1),
				config: providerConfigInput.optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const repos = getRepos();
			const current = await repos.provider.findById(input.id);
			if (!current) {
				throw new Error("Provider not found");
			}

			const existing = await repos.provider.findByProjectAndName(current.projectId, input.name);
			if (existing && existing.id !== input.id) {
				throw new Error(`Provider "${input.name}" already exists in this project`);
			}

			const config = toProviderConfig(input);
			return repos.provider.update(input.id, {
				type: input.type,
				name: input.name,
				model: input.model,
				config,
			});
		}),

	delete: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return getRepos().provider.delete(input);
	}),

	testConnection: publicProcedure
		.input(
			z.object({ id: z.string(), timeoutMs: z.number().int().min(1000).max(30000).optional() }),
		)
		.mutation(async ({ input }) => {
			const record = await getRepos().provider.findById(input.id);
			if (!record) {
				throw new Error("Provider not found");
			}
			if (record.type === "custom") {
				throw new Error(
					"Custom providers require SDK/CLI code and cannot be tested from the dashboard.",
				);
			}

			const provider = createProvider(providerConfigFromRecord(record));
			const response = await provider.generate(CONNECTION_TEST_PROMPT, {
				temperature: 0,
				maxTokens: CONNECTION_TEST_MAX_TOKENS,
				stream: false,
				timeoutMs: input.timeoutMs ?? CONNECTION_TEST_TIMEOUT_MS,
			});

			if (response.error) {
				throw new Error(response.error);
			}

			return {
				ok: true,
				latencyMs: response.latencyMs,
				output: response.output.slice(0, 200),
				tokenUsage: response.tokenUsage,
			};
		}),
});
