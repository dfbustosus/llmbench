import { router } from "../server";
import { comparisonRouter } from "./comparison";
import { datasetRouter } from "./dataset";
import { evalRunRouter } from "./eval-run";
import { projectRouter } from "./project";

export const appRouter = router({
	project: projectRouter,
	dataset: datasetRouter,
	evalRun: evalRunRouter,
	comparison: comparisonRouter,
});

export type AppRouter = typeof appRouter;
