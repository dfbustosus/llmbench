import { z } from "zod";
import { getRepos, publicProcedure, router } from "../server";

export const projectRouter = router({
	list: publicProcedure.query(async () => {
		return getRepos().project.findAll();
	}),

	getById: publicProcedure.input(z.string()).query(async ({ input }) => {
		return getRepos().project.findById(input);
	}),

	create: publicProcedure
		.input(z.object({ name: z.string(), description: z.string().optional() }))
		.mutation(async ({ input }) => {
			return getRepos().project.create(input);
		}),

	update: publicProcedure
		.input(
			z.object({
				id: z.string(),
				name: z.string().optional(),
				description: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const { id, ...data } = input;
			return getRepos().project.update(id, data);
		}),

	delete: publicProcedure.input(z.string()).mutation(async ({ input }) => {
		return getRepos().project.delete(input);
	}),
});
