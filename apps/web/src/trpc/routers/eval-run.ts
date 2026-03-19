import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

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

	cancel: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		const run = await getRepos().evalRun.findById(input);
		if (!run) {
			throw new Error("Run not found");
		}
		if (run.status !== "running" && run.status !== "pending") {
			throw new Error(`Cannot cancel run with status "${run.status}"`);
		}
		await getRepos().evalRun.updateStatus(input, "cancelled");
		return true;
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
