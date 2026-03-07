import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

export const evalRunRouter = router({
	listByProject: publicProcedure
		.input(z.object({ projectId: z.string(), limit: z.number().optional() }))
		.query(async ({ input }) => {
			return getRepos().evalRun.findByProjectId(input.projectId, input.limit);
		}),

	getById: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().evalRun.findById(input);
	}),

	getResults: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().evalResult.findByRunId(input);
	}),

	getScores: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().score.findByResultId(input);
	}),

	getCostRecords: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().costRecord.findByRunId(input);
	}),

	delete: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return getRepos().evalRun.delete(input);
	}),
});
