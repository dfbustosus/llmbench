import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";

export type LLMBenchDB = ReturnType<typeof createDB>;

export function createDB(dbPath: string = "llmbench.db") {
	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	return db;
}

export function createInMemoryDB() {
	const sqlite = new Database(":memory:");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	return db;
}

const SCHEMA_VERSION = 4;

export function initializeDB(db: LLMBenchDB) {
	// 1. Create schema_migrations table
	db.run(
		/* sql */ `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER NOT NULL DEFAULT 0)`,
	);

	// 2. Ensure a row exists
	const row = db.get(/* sql */ `SELECT version FROM schema_migrations LIMIT 1`) as
		| { version: number }
		| undefined;
	if (!row) {
		db.run(/* sql */ `INSERT INTO schema_migrations (version) VALUES (0)`);
	}
	const currentVersion = row?.version ?? 0;

	// 3. Detect whether this is a brand new database (no tables yet)
	const isNewDB = !(db.get(
		/* sql */ `SELECT name FROM sqlite_master WHERE type='table' AND name='projects'`,
	) as unknown | undefined);

	// 4. Create tables with correct schema (CREATE TABLE IF NOT EXISTS is idempotent)
	createTables(db);

	// 5. Run migrations only for existing databases that need upgrading.
	//    New databases already have the correct schema from createTables().
	if (!isNewDB && currentVersion < SCHEMA_VERSION) {
		runMigrations(db, currentVersion);
	}

	if (currentVersion < SCHEMA_VERSION) {
		db.run(/* sql */ `UPDATE schema_migrations SET version = ${SCHEMA_VERSION}`);
	}
}

function createTables(db: LLMBenchDB) {
	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS projects (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			description TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS datasets (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			description TEXT,
			version INTEGER NOT NULL DEFAULT 1,
			content_hash TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS test_cases (
			id TEXT PRIMARY KEY,
			dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
			input TEXT NOT NULL,
			expected TEXT NOT NULL,
			messages TEXT,
			context TEXT,
			tags TEXT,
			assert TEXT,
			order_index INTEGER NOT NULL DEFAULT 0
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS providers (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			type TEXT NOT NULL,
			name TEXT NOT NULL,
			model TEXT NOT NULL,
			config TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS eval_runs (
			id TEXT PRIMARY KEY,
			project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
			dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'pending',
			config TEXT,
			total_cases INTEGER NOT NULL DEFAULT 0,
			completed_cases INTEGER NOT NULL DEFAULT 0,
			failed_cases INTEGER NOT NULL DEFAULT 0,
			total_cost REAL,
			total_tokens INTEGER,
			avg_latency_ms REAL,
			tags TEXT,
			dataset_version INTEGER,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			completed_at TEXT
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS eval_results (
			id TEXT PRIMARY KEY,
			run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
			test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
			provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
			input TEXT NOT NULL,
			output TEXT NOT NULL,
			expected TEXT NOT NULL,
			error TEXT,
			latency_ms REAL NOT NULL DEFAULT 0,
			time_to_first_token_ms REAL,
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			cost REAL,
			raw_response TEXT,
			tool_calls TEXT,
			created_at TEXT NOT NULL
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS scores (
			id TEXT PRIMARY KEY,
			result_id TEXT NOT NULL REFERENCES eval_results(id) ON DELETE CASCADE,
			scorer_id TEXT NOT NULL,
			scorer_name TEXT NOT NULL,
			scorer_type TEXT NOT NULL,
			value REAL NOT NULL,
			raw_value REAL,
			reason TEXT,
			metadata TEXT
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS cost_records (
			id TEXT PRIMARY KEY,
			run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
			provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
			model TEXT NOT NULL,
			input_tokens INTEGER NOT NULL DEFAULT 0,
			output_tokens INTEGER NOT NULL DEFAULT 0,
			total_tokens INTEGER NOT NULL DEFAULT 0,
			input_cost REAL NOT NULL DEFAULT 0,
			output_cost REAL NOT NULL DEFAULT 0,
			total_cost REAL NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS cache_entries (
			id TEXT PRIMARY KEY,
			cache_key TEXT NOT NULL,
			model TEXT NOT NULL,
			input TEXT NOT NULL,
			output TEXT NOT NULL,
			token_usage TEXT,
			latency_ms REAL,
			created_at TEXT NOT NULL,
			expires_at TEXT,
			hits INTEGER NOT NULL DEFAULT 0,
			tool_calls TEXT
		)
	`);

	db.run(/* sql */ `
		CREATE TABLE IF NOT EXISTS eval_events (
			seq INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
			event_type TEXT NOT NULL,
			payload TEXT NOT NULL,
			timestamp TEXT NOT NULL
		)
	`);

	// Create all indexes
	createIndexes(db);
	createUniqueIndexes(db);
}

function createIndexes(db: LLMBenchDB) {
	// datasets indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON datasets(project_id)`);

	// test_cases indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_test_cases_dataset_id ON test_cases(dataset_id)`);
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_test_cases_dataset_order ON test_cases(dataset_id, order_index)`,
	);

	// providers indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_providers_project_id ON providers(project_id)`);

	// eval_runs indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_runs_project_id ON eval_runs(project_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset_id ON eval_runs(dataset_id)`);

	// eval_results indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_results_run_id ON eval_results(run_id)`);
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_eval_results_run_provider ON eval_results(run_id, provider_id)`,
	);
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_results_test_case_id ON eval_results(test_case_id)`);

	// scores indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_scores_result_id ON scores(result_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_scores_scorer_id ON scores(scorer_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_scores_scorer_name ON scores(scorer_name)`);

	// cost_records indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_cost_records_run_id ON cost_records(run_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_cost_records_provider_id ON cost_records(provider_id)`);

	// cache_entries indexes
	db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_entries_key ON cache_entries(cache_key)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_cache_entries_expires_at ON cache_entries(expires_at)`);

	// eval_events indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_events_run_id_seq ON eval_events(run_id, seq)`);
}

/**
 * Creates UNIQUE indexes after deduplicating any pre-existing duplicate data.
 * Separated from createIndexes() because duplicates in old databases would cause
 * a hard failure that blocks the entire migration.
 */
function createUniqueIndexes(db: LLMBenchDB) {
	// Deduplicate scores before creating the unique index
	const deletedScores = db.run(
		`DELETE FROM scores WHERE id NOT IN (SELECT MIN(id) FROM scores GROUP BY result_id, scorer_id)`,
	);
	if (deletedScores.changes > 0) {
		console.log(`Removed ${deletedScores.changes} duplicate score(s) (by result_id, scorer_id).`);
	}
	db.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_result_scorer ON scores(result_id, scorer_id)`,
	);

	// Deduplicate eval_results before creating the unique index
	const deletedResults = db.run(
		`DELETE FROM eval_results WHERE id NOT IN (SELECT MIN(id) FROM eval_results GROUP BY run_id, test_case_id, provider_id)`,
	);
	if (deletedResults.changes > 0) {
		console.log(
			`Removed ${deletedResults.changes} duplicate eval result(s) (by run_id, test_case_id, provider_id).`,
		);
	}
	db.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_eval_results_unique ON eval_results(run_id, test_case_id, provider_id)`,
	);

	// Deduplicate providers before creating the unique index
	const deletedProviders = db.run(
		`DELETE FROM providers WHERE id NOT IN (SELECT MIN(id) FROM providers GROUP BY project_id, name)`,
	);
	if (deletedProviders.changes > 0) {
		console.log(`Removed ${deletedProviders.changes} duplicate provider(s) (by project_id, name).`);
	}
	db.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_project_name ON providers(project_id, name)`,
	);

	// Deduplicate datasets before creating the unique index
	const deletedDatasets = db.run(
		`DELETE FROM datasets WHERE id NOT IN (SELECT MIN(id) FROM datasets GROUP BY project_id, name, version)`,
	);
	if (deletedDatasets.changes > 0) {
		console.log(
			`Removed ${deletedDatasets.changes} duplicate dataset(s) (by project_id, name, version).`,
		);
	}
	db.run(
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_datasets_project_name_version ON datasets(project_id, name, version)`,
	);
}

function runMigrations(db: LLMBenchDB, fromVersion: number) {
	if (fromVersion < 1) {
		migrateToV1(db);
	}
	if (fromVersion < 2) {
		migrateToV2(db);
	}
	if (fromVersion < 3) {
		migrateToV3(db);
	}
	if (fromVersion < 4) {
		migrateToV4(db);
	}
}

/** Check whether a column exists on a table (avoids try/catch ALTER TABLE). */
function columnExists(db: LLMBenchDB, table: string, column: string): boolean {
	const rows = db.all(/* sql */ `PRAGMA table_info(${table})`) as Array<{ name: string }>;
	return rows.some((r) => r.name === column);
}

function migrateToV1(db: LLMBenchDB) {
	// Disable FK checks during migration to allow table recreation in any order
	db.run(`PRAGMA foreign_keys = OFF`);

	try {
		db.run(`BEGIN TRANSACTION`);

		// Add columns that may be missing on older databases
		if (!columnExists(db, "test_cases", "messages")) {
			db.run(`ALTER TABLE test_cases ADD COLUMN messages TEXT`);
		}
		if (!columnExists(db, "test_cases", "assert")) {
			db.run(`ALTER TABLE test_cases ADD COLUMN assert TEXT`);
		}
		if (!columnExists(db, "datasets", "content_hash")) {
			db.run(`ALTER TABLE datasets ADD COLUMN content_hash TEXT`);
		}
		if (!columnExists(db, "eval_runs", "dataset_version")) {
			db.run(`ALTER TABLE eval_runs ADD COLUMN dataset_version INTEGER`);
		}

		// Clean up orphaned eval_events before adding FK constraint
		db.run(`DELETE FROM eval_events WHERE run_id NOT IN (SELECT id FROM eval_runs)`);

		// Recreate eval_runs with CASCADE on dataset_id FK
		db.run(/* sql */ `
			CREATE TABLE _new_eval_runs (
				id TEXT PRIMARY KEY,
				project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
				dataset_id TEXT NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
				status TEXT NOT NULL DEFAULT 'pending',
				config TEXT,
				total_cases INTEGER NOT NULL DEFAULT 0,
				completed_cases INTEGER NOT NULL DEFAULT 0,
				failed_cases INTEGER NOT NULL DEFAULT 0,
				total_cost REAL,
				total_tokens INTEGER,
				avg_latency_ms REAL,
				tags TEXT,
				dataset_version INTEGER,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				completed_at TEXT
			)
		`);
		db.run(`INSERT INTO _new_eval_runs SELECT * FROM eval_runs`);
		db.run(`DROP TABLE eval_runs`);
		db.run(`ALTER TABLE _new_eval_runs RENAME TO eval_runs`);

		// Recreate eval_results with CASCADE on test_case_id and provider_id FKs
		db.run(/* sql */ `
			CREATE TABLE _new_eval_results (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
				test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
				provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
				input TEXT NOT NULL,
				output TEXT NOT NULL,
				expected TEXT NOT NULL,
				error TEXT,
				latency_ms REAL NOT NULL DEFAULT 0,
				input_tokens INTEGER NOT NULL DEFAULT 0,
				output_tokens INTEGER NOT NULL DEFAULT 0,
				total_tokens INTEGER NOT NULL DEFAULT 0,
				cost REAL,
				raw_response TEXT,
				created_at TEXT NOT NULL
			)
		`);
		db.run(`INSERT INTO _new_eval_results SELECT * FROM eval_results`);
		db.run(`DROP TABLE eval_results`);
		db.run(`ALTER TABLE _new_eval_results RENAME TO eval_results`);

		// Recreate cost_records with CASCADE on provider_id FK
		db.run(/* sql */ `
			CREATE TABLE _new_cost_records (
				id TEXT PRIMARY KEY,
				run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
				provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
				model TEXT NOT NULL,
				input_tokens INTEGER NOT NULL DEFAULT 0,
				output_tokens INTEGER NOT NULL DEFAULT 0,
				total_tokens INTEGER NOT NULL DEFAULT 0,
				input_cost REAL NOT NULL DEFAULT 0,
				output_cost REAL NOT NULL DEFAULT 0,
				total_cost REAL NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			)
		`);
		db.run(`INSERT INTO _new_cost_records SELECT * FROM cost_records`);
		db.run(`DROP TABLE cost_records`);
		db.run(`ALTER TABLE _new_cost_records RENAME TO cost_records`);

		// Recreate eval_events with FK reference to eval_runs and CASCADE
		db.run(/* sql */ `
			CREATE TABLE _new_eval_events (
				seq INTEGER PRIMARY KEY AUTOINCREMENT,
				run_id TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
				event_type TEXT NOT NULL,
				payload TEXT NOT NULL,
				timestamp TEXT NOT NULL
			)
		`);
		db.run(`INSERT INTO _new_eval_events SELECT * FROM eval_events`);
		db.run(`DROP TABLE eval_events`);
		db.run(`ALTER TABLE _new_eval_events RENAME TO eval_events`);

		db.run(`COMMIT`);
	} catch (e) {
		db.run(`ROLLBACK`);
		db.run(`PRAGMA foreign_keys = ON`);
		throw e;
	}

	// Re-enable FK checks and verify integrity
	db.run(`PRAGMA foreign_keys = ON`);

	// Recreate all indexes (they are dropped when tables are dropped)
	createIndexes(db);
	createUniqueIndexes(db);
}

function migrateToV2(db: LLMBenchDB) {
	// V2 adds UNIQUE constraints on providers(project_id, name) and
	// datasets(project_id, name, version). The dedup + index creation is
	// handled by createUniqueIndexes() which runs for every init, so we
	// only need to ensure the indexes are present.
	createUniqueIndexes(db);
}

function migrateToV3(db: LLMBenchDB) {
	// V3 adds tool_calls columns for tool/function calling support
	if (!columnExists(db, "eval_results", "tool_calls")) {
		db.run(`ALTER TABLE eval_results ADD COLUMN tool_calls TEXT`);
	}
	if (!columnExists(db, "cache_entries", "tool_calls")) {
		db.run(`ALTER TABLE cache_entries ADD COLUMN tool_calls TEXT`);
	}
}

function migrateToV4(db: LLMBenchDB) {
	// V4 adds time_to_first_token_ms for streaming TTFT measurement
	if (!columnExists(db, "eval_results", "time_to_first_token_ms")) {
		db.run(`ALTER TABLE eval_results ADD COLUMN time_to_first_token_ms REAL`);
	}
}
