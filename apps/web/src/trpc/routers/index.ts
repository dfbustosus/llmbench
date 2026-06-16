import { router } from "../server";
import { comparisonRouter } from "./comparison";
import { datasetRouter } from "./dataset";
import { evalRunRouter } from "./eval-run";
import { projectRouter } from "./project";
import { providerRouter } from "./provider";

export const appRouter = router({
	project: projectRouter,
	dataset: datasetRouter,
	evalRun: evalRunRouter,
	provider: providerRouter,
	comparison: comparisonRouter,
});

export type AppRouter = typeof appRouter;
