import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

export const datasetRouter = router({
	listByProject: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().dataset.findByProjectId(input);
	}),

	getById: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().dataset.findById(input);
	}),

	create: publicProcedure
		.input(
			z.object({
				projectId: z.string(),
				name: z.string(),
				description: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			return getRepos().dataset.create(input);
		}),

	getTestCases: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().testCase.findByDatasetId(input);
	}),

	addTestCase: publicProcedure
		.input(
			z.object({
				datasetId: z.string(),
				input: z.string(),
				expected: z.string(),
				tags: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input }) => {
			return getRepos().testCase.create(input);
		}),

	delete: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return getRepos().dataset.delete(input);
	}),
});
