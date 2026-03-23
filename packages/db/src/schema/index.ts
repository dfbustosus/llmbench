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
	(table) => [
		index("idx_datasets_project_id").on(table.projectId),
		uniqueIndex("idx_datasets_project_name_version").on(table.projectId, table.name, table.version),
	],
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
		assert: text("assert"), // JSON - TestCaseAssertion[]
		orderIndex: integer("order_index").notNull().default(0),
	},
	(table) => [
		index("idx_test_cases_dataset_id").on(table.datasetId),
		index("idx_test_cases_dataset_order").on(table.datasetId, table.orderIndex),
	],
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
	(table) => [
		index("idx_providers_project_id").on(table.projectId),
		uniqueIndex("idx_providers_project_name").on(table.projectId, table.name),
	],
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
			.references(() => datasets.id, { onDelete: "cascade" }),
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
			.references(() => testCases.id, { onDelete: "cascade" }),
		providerId: text("provider_id")
			.notNull()
			.references(() => providers.id, { onDelete: "cascade" }),
		input: text("input").notNull(),
		output: text("output").notNull(),
		expected: text("expected").notNull(),
		error: text("error"),
		latencyMs: real("latency_ms").notNull().default(0),
		timeToFirstTokenMs: real("time_to_first_token_ms"),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		totalTokens: integer("total_tokens").notNull().default(0),
		cost: real("cost"),
		rawResponse: text("raw_response"), // JSON
		toolCalls: text("tool_calls"), // JSON
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("idx_eval_results_run_id").on(table.runId),
		index("idx_eval_results_run_provider").on(table.runId, table.providerId),
		index("idx_eval_results_test_case_id").on(table.testCaseId),
		uniqueIndex("idx_eval_results_unique").on(table.runId, table.testCaseId, table.providerId),
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
	(table) => [
		index("idx_scores_result_id").on(table.resultId),
		index("idx_scores_scorer_id").on(table.scorerId),
		index("idx_scores_scorer_name").on(table.scorerName),
		uniqueIndex("idx_scores_result_scorer").on(table.resultId, table.scorerId),
	],
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
		toolCalls: text("tool_calls"), // JSON
	},
	(table) => [
		uniqueIndex("idx_cache_entries_key").on(table.cacheKey),
		index("idx_cache_entries_expires_at").on(table.expiresAt),
	],
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
			.references(() => providers.id, { onDelete: "cascade" }),
		model: text("model").notNull(),
		inputTokens: integer("input_tokens").notNull().default(0),
		outputTokens: integer("output_tokens").notNull().default(0),
		totalTokens: integer("total_tokens").notNull().default(0),
		inputCost: real("input_cost").notNull().default(0),
		outputCost: real("output_cost").notNull().default(0),
		totalCost: real("total_cost").notNull().default(0),
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("idx_cost_records_run_id").on(table.runId),
		index("idx_cost_records_provider_id").on(table.providerId),
	],
);

export const evalEvents = sqliteTable(
	"eval_events",
	{
		seq: integer("seq").primaryKey({ autoIncrement: true }),
		runId: text("run_id")
			.notNull()
			.references(() => evalRuns.id, { onDelete: "cascade" }),
		eventType: text("event_type").notNull(),
		payload: text("payload").notNull(),
		timestamp: text("timestamp").notNull(),
	},
	(table) => [index("idx_eval_events_run_id_seq").on(table.runId, table.seq)],
);
