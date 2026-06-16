import type { ProviderConfig, ProviderType } from "@llmbench/types";
import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

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
});
