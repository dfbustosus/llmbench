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

export function initializeDB(db: LLMBenchDB) {
	// Create all tables using raw SQL
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
			dataset_id TEXT NOT NULL REFERENCES datasets(id),
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
			test_case_id TEXT NOT NULL REFERENCES test_cases(id),
			provider_id TEXT NOT NULL REFERENCES providers(id),
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
			provider_id TEXT NOT NULL REFERENCES providers(id),
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
			hits INTEGER NOT NULL DEFAULT 0
		)
	`);

	// Migrations for existing databases
	try {
		db.run(`ALTER TABLE test_cases ADD COLUMN messages TEXT`);
	} catch {
		// Column already exists
	}

	try {
		db.run(`ALTER TABLE datasets ADD COLUMN content_hash TEXT`);
	} catch {
		// Column already exists
	}

	try {
		db.run(`ALTER TABLE eval_runs ADD COLUMN dataset_version INTEGER`);
	} catch {
		// Column already exists
	}

	// Create indexes
	db.run(`CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON datasets(project_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_test_cases_dataset_id ON test_cases(dataset_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_providers_project_id ON providers(project_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_runs_project_id ON eval_runs(project_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_runs_dataset_id ON eval_runs(dataset_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_eval_results_run_id ON eval_results(run_id)`);
	db.run(
		`CREATE INDEX IF NOT EXISTS idx_eval_results_run_provider ON eval_results(run_id, provider_id)`,
	);
	db.run(`CREATE INDEX IF NOT EXISTS idx_scores_result_id ON scores(result_id)`);
	db.run(`CREATE INDEX IF NOT EXISTS idx_cost_records_run_id ON cost_records(run_id)`);
	db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_entries_key ON cache_entries(cache_key)`);
}
