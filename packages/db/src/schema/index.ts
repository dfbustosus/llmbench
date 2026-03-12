import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: text("created_at").notNull(),
	updatedAt: text("updated_at").notNull(),
});

export const datasets = sqliteTable(
	"datasets",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		version: integer("version").notNull().default(1),
		contentHash: text("content_hash"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [index("idx_datasets_project_id").on(table.projectId)],
);

export const testCases = sqliteTable(
	"test_cases",
	{
		id: text("id").primaryKey(),
		datasetId: text("dataset_id")
			.notNull()
			.references(() => datasets.id, { onDelete: "cascade" }),
		input: text("input").notNull(),
		expected: text("expected").notNull(),
		messages: text("messages"), // JSON - ChatMessage[]
		context: text("context"), // JSON
		tags: text("tags"), // JSON array
		orderIndex: integer("order_index").notNull().default(0),
	},
	(table) => [index("idx_test_cases_dataset_id").on(table.datasetId)],
);

export const providers = sqliteTable(
	"providers",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		type: text("type").notNull(), // ProviderType
		name: text("name").notNull(),
		model: text("model").notNull(),
		config: text("config"), // JSON
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [index("idx_providers_project_id").on(table.projectId)],
);

export const evalRuns = sqliteTable(
	"eval_runs",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		datasetId: text("dataset_id")
			.notNull()
			.references(() => datasets.id),
		status: text("status").notNull().default("pending"), // EvalStatus
		config: text("config"), // JSON - EvalRunConfig
		totalCases: integer("total_cases").notNull().default(0),
		completedCases: integer("completed_cases").notNull().default(0),
		failedCases: integer("failed_cases").notNull().default(0),
		totalCost: real("total_cost"),
		totalTokens: integer("total_tokens"),
		avgLatencyMs: real("avg_latency_ms"),
		tags: text("tags"), // JSON
		datasetVersion: integer("dataset_version"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
		completedAt: text("completed_at"),
	},
	(table) => [
		index("idx_eval_runs_project_id").on(table.projectId),
		index("idx_eval_runs_dataset_id").on(table.datasetId),
	],
);

export const evalResults = sqliteTable(
	"eval_results",
	{
		id: text("id").primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => evalRuns.id, { onDelete: "cascade" }),
		testCaseId: text("test_case_id")
			.notNull()
			.references(() => testCases.id),
		providerId: text("provider_id")
			.notNull()
			.references(() => providers.id),
		input: text("input").notNull(),
		output: text("output").notNull(),
		expected: text("expected").notNull(),
		error: text("error"),
		latencyMs: real("latency_ms").notNull().default(0),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		totalTokens: integer("total_tokens").notNull().default(0),
		cost: real("cost"),
		rawResponse: text("raw_response"), // JSON
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("idx_eval_results_run_id").on(table.runId),
		index("idx_eval_results_run_provider").on(table.runId, table.providerId),
	],
);

export const scores = sqliteTable(
	"scores",
	{
		id: text("id").primaryKey(),
		resultId: text("result_id")
			.notNull()
			.references(() => evalResults.id, { onDelete: "cascade" }),
		scorerId: text("scorer_id").notNull(),
		scorerName: text("scorer_name").notNull(),
		scorerType: text("scorer_type").notNull(),
		value: real("value").notNull(), // 0-1 normalized
		rawValue: real("raw_value"),
		reason: text("reason"),
		metadata: text("metadata"), // JSON
	},
	(table) => [index("idx_scores_result_id").on(table.resultId)],
);

export const cacheEntries = sqliteTable(
	"cache_entries",
	{
		id: text("id").primaryKey(),
		cacheKey: text("cache_key").notNull(),
		model: text("model").notNull(),
		input: text("input").notNull(),
		output: text("output").notNull(),
		tokenUsage: text("token_usage"), // JSON
		latencyMs: real("latency_ms"),
		createdAt: text("created_at").notNull(),
		expiresAt: text("expires_at"),
		hits: integer("hits").notNull().default(0),
	},
	(table) => [uniqueIndex("idx_cache_entries_key").on(table.cacheKey)],
);

export const costRecords = sqliteTable(
	"cost_records",
	{
		id: text("id").primaryKey(),
		runId: text("run_id")
			.notNull()
			.references(() => evalRuns.id, { onDelete: "cascade" }),
		providerId: text("provider_id")
			.notNull()
			.references(() => providers.id),
		model: text("model").notNull(),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		totalTokens: integer("total_tokens").notNull().default(0),
		inputCost: real("input_cost").notNull().default(0),
		outputCost: real("output_cost").notNull().default(0),
		totalCost: real("total_cost").notNull().default(0),
		createdAt: text("created_at").notNull(),
	},
	(table) => [index("idx_cost_records_run_id").on(table.runId)],
);
