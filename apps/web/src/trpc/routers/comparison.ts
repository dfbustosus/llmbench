import { RunComparator } from "@llmbench/core";
import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

export const comparisonRouter = router({
	compare: publicProcedure
		.input(z.object({ runIdA: z.string(), runIdB: z.string() }))
		.query(async ({ input }) => {
			const repos = getRepos();
			const comparator = new RunComparator(repos.evalRun, repos.evalResult, repos.score);
			return comparator.compare(input.runIdA, input.runIdB);
		}),
});
