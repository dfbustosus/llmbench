import {
	CostRecordRepository,
	createDB,
	DatasetRepository,
	type LLMBenchDB,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	ProjectRepository,
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

let db: LLMBenchDB | null = null;

export function getDB(): LLMBenchDB {
	if (!db) {
		const dbPath = process.env.LLMBENCH_DB_PATH || "./llmbench.db";
		db = createDB(dbPath);
		initializeDB(db);
	}
	return db;
}

// Shared repository instances (lazy singletons)
let _repos: ReturnType<typeof createRepositories> | null = null;

function createRepositories(database: LLMBenchDB) {
	return {
		project: new ProjectRepository(database),
		dataset: new DatasetRepository(database),
		testCase: new TestCaseRepository(database),
		evalRun: new EvalRunRepository(database),
		evalResult: new EvalResultRepository(database),
		score: new ScoreRepository(database),
		costRecord: new CostRecordRepository(database),
	};
}

export function getRepos() {
	if (!_repos) {
		_repos = createRepositories(getDB());
	}
	return _repos;
}
