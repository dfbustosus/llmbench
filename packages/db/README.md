<div align="center">

# @llmbench/db

**SQLite database layer for the LLMBench evaluation platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/db.svg)](https://www.npmjs.com/package/@llmbench/db)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

Local-first persistence for LLMBench. Uses SQLite (via `better-sqlite3`) with Drizzle ORM for type-safe queries. All data lives in a single `.db` file — no cloud, no external services.

## Installation

```bash
npm install @llmbench/db
```

## Quick Example

```typescript
import {
  createDB,
  createInMemoryDB,
  initializeDB,
  ProjectRepository,
  DatasetRepository,
  TestCaseRepository,
  EvalRunRepository,
  EvalResultRepository,
  ScoreRepository,
  CostRecordRepository,
} from "@llmbench/db";

// Create a persistent database (or use createInMemoryDB() for testing)
const db = createDB("./llmbench.db");
initializeDB(db);

// Create a project
const projectRepo = new ProjectRepository(db);
const project = await projectRepo.create({
  name: "My Eval Project",
  description: "Testing GPT-4o on QA tasks",
});

// Create a dataset with test cases
const datasetRepo = new DatasetRepository(db);
const dataset = await datasetRepo.create({
  projectId: project.id,
  name: "QA Dataset",
  description: "General knowledge questions",
});

const testCaseRepo = new TestCaseRepository(db);

// Bulk-create test cases
const testCases = await testCaseRepo.createMany([
  { datasetId: dataset.id, input: "What is the capital of France?", expected: "Paris" },
  { datasetId: dataset.id, input: "What is 2 + 2?", expected: "4" },
  { datasetId: dataset.id, input: "Who wrote Hamlet?", expected: "Shakespeare" },
]);

// Query data
const allProjects = await projectRepo.findAll();
const projectDatasets = await datasetRepo.findByProjectId(project.id);
const cases = await testCaseRepo.findByDatasetId(dataset.id);
```

## Database Setup

```typescript
// Persistent file-based database
const db = createDB("./llmbench.db");
initializeDB(db);  // creates tables and indexes

// In-memory database (for testing)
const db = createInMemoryDB();
initializeDB(db);
```

`createDB` enables WAL journal mode and foreign key constraints automatically.

`initializeDB` creates all tables, indexes, and unique constraints. For existing databases, it runs versioned migrations automatically (tracking progress in a `schema_migrations` table). Duplicate rows are deduplicated before unique indexes are applied.

## Repositories

### ProjectRepository

```typescript
const repo = new ProjectRepository(db);

const project = await repo.create({ name: "My Project", description: "Optional" });
const found = await repo.findById(project.id);
const all = await repo.findAll({ limit: 100, offset: 0 });  // pagination optional
const total = await repo.countAll();
const updated = await repo.update(project.id, { name: "New Name" });
const deleted = await repo.delete(project.id);  // cascades to datasets, runs, etc.
```

### DatasetRepository

```typescript
const repo = new DatasetRepository(db);

const dataset = await repo.create({
  projectId: project.id,
  name: "QA Dataset",
  description: "Optional",
});
const found = await repo.findById(dataset.id);
const byProject = await repo.findByProjectId(project.id, { limit: 50 });
const byName = await repo.findByNameInProject(project.id, "QA Dataset");  // sorted by version DESC
const updated = await repo.update(dataset.id, { name: "Renamed", version: 2 });
const deleted = await repo.delete(dataset.id);  // cascades to test cases
```

### TestCaseRepository

```typescript
const repo = new TestCaseRepository(db);

// Single create
const tc = await repo.create({
  datasetId: dataset.id,
  input: "What is the capital of France?",
  expected: "Paris",
  messages: [{ role: "user", content: "..." }],  // optional: multi-turn
  context: { difficulty: "easy" },     // optional: template variables
  tags: ["geography", "europe"],       // optional: filtering
  assert: [{ type: "contains", value: "Paris" }], // optional: per-test assertions
  orderIndex: 0,
});

// Bulk create (auto-indexes orderIndex)
const cases = await repo.createMany([
  { datasetId: dataset.id, input: "Q1", expected: "A1" },
  { datasetId: dataset.id, input: "Q2", expected: "A2" },
]);

const byDataset = await repo.findByDatasetId(dataset.id, { limit: 500 });
const found = await repo.findById(tc.id);
const deleted = await repo.delete(tc.id);
const count = await repo.deleteByDatasetId(dataset.id);  // returns number deleted
```

### EvalRunRepository

```typescript
const repo = new EvalRunRepository(db);

const run = await repo.create({
  projectId: project.id,
  datasetId: dataset.id,
  config: {
    providerIds: ["prov_001"],
    scorerConfigs: [],
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },
  totalCases: 10,
  tags: ["v2", "gpt4o"],
});

const found = await repo.findById(run.id);
const byProject = await repo.findByProjectId(project.id, { limit: 50 });
const recent = await repo.findRecent(10);  // most recent across all projects
const counts = await repo.countAll();      // { total: number, active: number }

await repo.updateStatus(run.id, "running");
await repo.updateStatus(run.id, "completed");  // auto-sets completedAt

await repo.updateProgress(run.id, {
  completedCases: 8,
  failedCases: 2,
  totalCost: 0.0045,
  totalTokens: 15000,
  avgLatencyMs: 230,
});
```

### EvalResultRepository

```typescript
const repo = new EvalResultRepository(db);

const result = await repo.create({
  runId: run.id,
  testCaseId: tc.id,
  providerId: "prov_001",
  input: "What is the capital of France?",
  output: "Paris",
  expected: "Paris",
  latencyMs: 150,
  inputTokens: 12,
  outputTokens: 3,
  totalTokens: 15,
  cost: 0.00003,
  rawResponse: { choices: [/*...*/] },  // optional: full API response
});

const byRun = await repo.findByRunId(run.id);
const found = await repo.findById(result.id);
```

### ScoreRepository

```typescript
const repo = new ScoreRepository(db);

// Save a single score
await repo.create(result.id, {
  scorerId: "exact-match",
  scorerName: "Exact Match",
  scorerType: "exact-match",
  value: 1.0,
  rawValue: 1.0,
  reason: "Exact match (case-insensitive)",
  metadata: {},
});

// Save multiple scores at once (batched + transactional)
await repo.createMany(result.id, [
  { scorerId: "exact-match", scorerName: "Exact Match", scorerType: "exact-match", value: 1 },
  { scorerId: "contains", scorerName: "Contains", scorerType: "contains", value: 1 },
]);

const scores = await repo.findByResultId(result.id);
const byRun = await repo.findByRunId(run.id, { limit: 5000 });  // Record<resultId, ScoreResult[]>
const deleted = await repo.deleteByRunId(run.id);                // returns count deleted
```

### CostRecordRepository

```typescript
const repo = new CostRecordRepository(db);

await repo.create({
  runId: run.id,
  providerId: "prov_001",
  model: "gpt-4o",
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
  inputCost: 0.0025,
  outputCost: 0.005,
  totalCost: 0.0075,
});

const costRecords = await repo.findByRunId(run.id, { limit: 100 });
```

### ProviderRepository

```typescript
const repo = new ProviderRepository(db);

const provider = await repo.create({
  projectId: project.id,
  type: "openai",
  name: "GPT-4o",
  model: "gpt-4o",
  config: { temperature: 0, maxTokens: 1024 },
});

const found = await repo.findById(provider.id);
const byProject = await repo.findByProjectId(project.id);
const byName = await repo.findByProjectAndName(project.id, "GPT-4o");  // leverages unique index
const updated = await repo.update(provider.id, { model: "gpt-4o-mini" });
const deleted = await repo.delete(provider.id);  // cascades to eval_results, cost_records
```

### CacheRepository

```typescript
const repo = new CacheRepository(db);

// Cache entries are managed by CacheManager in @llmbench/core
await repo.deleteExpired();           // clean up expired entries
const deleted = await repo.deleteAll(); // clear entire cache
```

### EventRepository

```typescript
const repo = new EventRepository(db);

// Events are persisted by EventPersister in @llmbench/core
repo.insert({ runId, eventType: "run:started", payload: "{}", timestamp: new Date().toISOString() });
const events = repo.findAfterCursor(runId, 0, 100);  // cursor-based SSE streaming
repo.deleteByRunId(runId);                            // clean up events for a specific run
repo.deleteStale();                                   // clean up events for completed/failed runs
```

## Schema

10 tables with proper foreign keys and cascade deletes:

| Table | Description | Key Columns |
|-------|-------------|-------------|
| `projects` | Top-level project | `id`, `name`, `description` |
| `datasets` | Test case collections | `id`, `project_id`, `name`, `version`, `content_hash` |
| `test_cases` | Individual test cases | `id`, `dataset_id`, `input`, `expected`, `context`, `tags`, `assert` |
| `providers` | LLM provider configs | `id`, `project_id`, `type`, `name`, `model`, `config` |
| `eval_runs` | Evaluation runs | `id`, `project_id`, `dataset_id`, `status`, `config`, `total_cost` |
| `eval_results` | Per-request results | `id`, `run_id`, `test_case_id`, `provider_id`, `output`, `latency_ms`, `cost` |
| `scores` | Scorer results | `id`, `result_id`, `scorer_id`, `value`, `reason` |
| `cost_records` | Cost tracking | `id`, `run_id`, `provider_id`, `model`, token/cost columns |
| `cache_entries` | Response cache | `id`, `cache_key`, `model`, `input`, `output`, `expires_at`, `hits` |
| `eval_events` | Event log for SSE streaming | `seq`, `run_id`, `event_type`, `payload`, `timestamp` |

### Cascade Rules

- Delete a **project** → cascades to datasets, providers, eval_runs
- Delete a **dataset** → cascades to test_cases, and to eval_runs (via dataset_id FK)
- Delete a **provider** → cascades to eval_results and cost_records (via provider_id FK)
- Delete an **eval_run** → cascades to eval_results, cost_records, eval_events
- Delete an **eval_result** → cascades to scores
- Delete a **test_case** → cascades to eval_results (via test_case_id FK)

### Unique Constraints

- `providers(project_id, name)` — one provider name per project
- `datasets(project_id, name, version)` — one version per dataset name per project
- `eval_results(run_id, test_case_id, provider_id)` — one result per test case per provider per run
- `scores(result_id, scorer_id)` — one score per scorer per result
- `cache_entries(cache_key)` — unique cache keys

### Pagination

All list methods accept optional `{ limit, offset }`. Defaults are defined in `DEFAULT_LIMITS`:

| Constant | Value | Used by |
|----------|-------|---------|
| `BROWSE` | 1,000 | Projects, datasets, providers, cost records |
| `RUNS` | 50 | Eval runs per project |
| `OPERATIONAL` | 5,000 | Test cases, eval results |
| `SCORES` | 10,000 | Scores joined across results |

Override per-call: `repo.findByDatasetId(id, { limit: 100, offset: 200 })`.

### Implementation Details

- IDs generated with `nanoid()`
- Timestamps as ISO 8601 strings
- JSON fields (`context`, `tags`, `config`, `metadata`, `rawResponse`) stored as TEXT, parsed on read
- WAL journal mode enabled for concurrent reads
- Foreign keys enforced at the SQLite level

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
