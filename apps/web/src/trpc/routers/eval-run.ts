import { z } from "zod";
import { cancelEvaluationRun, startEvaluationRun } from "@/server/run-controller";
import { getRepos, publicProcedure, router } from "../server";

const runnableScorerTypes = [
	"exact-match",
	"contains",
	"regex",
	"json-match",
	"json-schema",
	"is-json",
	"is-sql",
	"is-xml",
	"is-valid-function-call",
	"cosine-similarity",
	"levenshtein",
	"bleu",
	"rouge",
	"tool-call-accuracy",
	"trajectory-validation",
] as const;

function scorerName(type: (typeof runnableScorerTypes)[number]): string {
	return type
		.split("-")
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

export const evalRunRouter = router({
	listByProject: publicProcedure
		.input(z.object({ projectId: z.string(), limit: z.number().optional() }))
		.query(async ({ input }) => {
			return getRepos().evalRun.findByProjectId(input.projectId, { limit: input.limit });
		}),

	getById: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().evalRun.findById(input);
	}),

	getResults: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().evalResult.findByRunId(input);
	}),

	getScoresByRunId: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().score.findByRunId(input);
	}),

	getProvidersByProject: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().provider.findByProjectId(input);
	}),

	start: publicProcedure
		.input(
			z.object({
				projectId: z.string(),
				datasetId: z.string(),
				providerIds: z.array(z.string()).optional(),
				scorers: z.array(z.enum(runnableScorerTypes)).min(1).default(["exact-match"]),
				concurrency: z.number().int().min(1).max(50).default(5),
				maxRetries: z.number().int().min(0).max(10).default(3),
				timeoutMs: z.number().int().min(1000).max(300000).default(30000),
				cacheEnabled: z.boolean().default(true),
				ttlHours: z.number().positive().optional(),
				tags: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const scorerConfigs = input.scorers.map((type) => ({
				id: type,
				name: scorerName(type),
				type,
			}));

			return startEvaluationRun({
				projectId: input.projectId,
				datasetId: input.datasetId,
				providerIds: input.providerIds,
				scorerConfigs,
				concurrency: input.concurrency,
				maxRetries: input.maxRetries,
				timeoutMs: input.timeoutMs,
				cacheEnabled: input.cacheEnabled,
				ttlHours: input.ttlHours,
				tags: input.tags,
			});
		}),

	cancel: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return cancelEvaluationRun(input);
	}),

	recent: publicProcedure
		.input(z.object({ limit: z.number().optional() }).optional())
		.query(async ({ input }) => {
			return getRepos().evalRun.findRecent(input?.limit ?? 10);
		}),

	delete: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return getRepos().evalRun.delete(input);
	}),
});
