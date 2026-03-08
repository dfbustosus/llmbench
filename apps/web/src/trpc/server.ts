import {
	CostRecordRepository,
	createDB,
	DatasetRepository,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	type LLMBenchDB,
	ProjectRepository,
	ProviderRepository,
	ScoreRepository,
	TestCaseRepository,
} from "@llmbench/db";
import { initTRPC } from "@trpc/server";
import superjson from "superjson";

const t = initTRPC.context<{ db: LLMBenchDB }>().create({
	transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Use globalThis to persist DB connection across Next.js HMR in dev mode
const globalForDb = globalThis as unknown as {
	__llmbenchDb?: LLMBenchDB;
	__llmbenchRepos?: ReturnType<typeof createRepositories>;
};

export function getDB(): LLMBenchDB {
	if (!globalForDb.__llmbenchDb) {
		const dbPath = process.env.LLMBENCH_DB_PATH || "./llmbench.db";
		globalForDb.__llmbenchDb = createDB(dbPath);
		initializeDB(globalForDb.__llmbenchDb);
	}
	return globalForDb.__llmbenchDb;
}

function createRepositories(database: LLMBenchDB) {
	return {
		project: new ProjectRepository(database),
		dataset: new DatasetRepository(database),
		testCase: new TestCaseRepository(database),
		evalRun: new EvalRunRepository(database),
		evalResult: new EvalResultRepository(database),
		score: new ScoreRepository(database),
		costRecord: new CostRecordRepository(database),
		provider: new ProviderRepository(database),
	};
}

export function getRepos() {
	if (!globalForDb.__llmbenchRepos) {
		globalForDb.__llmbenchRepos = createRepositories(getDB());
	}
	return globalForDb.__llmbenchRepos;
}
