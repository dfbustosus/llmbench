/** Default pagination limits for repository queries. */
export const DEFAULT_LIMITS = {
	/** Projects, datasets, providers — browsing entities */
	BROWSE: 1000,
	/** Eval runs per project — dashboard listing */
	RUNS: 50,
	/** Test cases, eval results — operational queries */
	OPERATIONAL: 5000,
	/** Scores joined across results — high cardinality */
	SCORES: 10000,
} as const;

/**
 * Maximum rows per INSERT chunk. SQLite has a ~32,766 bind-variable limit;
 * with ~10 columns per row, 500 rows stays well under that ceiling.
 */
export const BATCH_CHUNK_SIZE = 500;
