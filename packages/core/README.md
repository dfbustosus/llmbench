<div align="center">

# @llmbench/core

**Evaluation engine, providers, and scorers for the LLMBench platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/core.svg)](https://www.npmjs.com/package/@llmbench/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This is the core engine that powers LLMBench. Use it directly if you want to build custom evaluation pipelines, integrate with your own tooling, or embed LLM evaluation into your application.

## Installation

```bash
npm install @llmbench/core
```

## Quick Example

Run a full evaluation pipeline programmatically:

```typescript
import {
  ExactMatchScorer,
  ContainsScorer,
  CosineSimilarityScorer,
  CostCalculator,
  CustomProvider,
  EvaluationEngine,
} from "@llmbench/core";
import {
  createInMemoryDB,
  initializeDB,
  ProjectRepository,
  DatasetRepository,
  TestCaseRepository,
  ProviderRepository,
  EvalRunRepository,
  EvalResultRepository,
  ScoreRepository,
  CostRecordRepository,
} from "@llmbench/db";

// 1. Set up database
const db = createInMemoryDB();
initializeDB(db);

// 2. Create repositories
const projectRepo = new ProjectRepository(db);
const datasetRepo = new DatasetRepository(db);
const testCaseRepo = new TestCaseRepository(db);
const providerRepo = new ProviderRepository(db);
const evalRunRepo = new EvalRunRepository(db);
const evalResultRepo = new EvalResultRepository(db);
const scoreRepo = new ScoreRepository(db);
const costRecordRepo = new CostRecordRepository(db);

// 3. Seed data
const project = await projectRepo.create({ name: "My Project" });
const dataset = await datasetRepo.create({
  projectId: project.id,
  name: "QA Dataset",
});
const tc = await testCaseRepo.create({
  datasetId: dataset.id,
  input: "What is the capital of France?",
  expected: "Paris",
  orderIndex: 0,
});

// 4. Create a custom provider (or use OpenAIProvider, AnthropicProvider, etc.)
const mockProvider = new CustomProvider(
  { type: "custom", name: "MockLLM", model: "mock-v1" },
  async (input) => ({
    output: input.includes("capital") ? "Paris" : "I don't know",
    latencyMs: 50,
    tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
  }),
);

const provRecord = await providerRepo.create({
  projectId: project.id,
  type: "custom",
  name: "MockLLM",
  model: "mock-v1",
  config: {},
});

// 5. Set up engine
const engine = new EvaluationEngine({
  providers: new Map([[provRecord.id, mockProvider]]),
  scorers: [new ExactMatchScorer(), new ContainsScorer()],
  evalRunRepo,
  evalResultRepo,
  scoreRepo,
  costRecordRepo,
  costCalculator: new CostCalculator(),
});

// 6. Listen to events
engine.onEvent((event) => {
  if (event.type === "run:progress") {
    console.log(`Progress: ${event.completedCases}/${event.totalCases}`);
  }
  if (event.type === "run:completed") {
    console.log(`Done! Avg score: ${event.avgScore}, cost: $${event.totalCost}`);
  }
});

// 7. Execute
const run = await evalRunRepo.create({
  projectId: project.id,
  datasetId: dataset.id,
  config: {
    providerIds: [provRecord.id],
    scorerConfigs: [],
    concurrency: 2,
    maxRetries: 1,
    timeoutMs: 5000,
  },
  totalCases: 1,
});

await engine.execute(run, [tc]);
```

## Providers

### Built-in Providers

```typescript
import {
  OpenAIProvider,
  AnthropicProvider,
  GoogleProvider,
  OllamaProvider,
  CustomProvider,
  createProvider,  // factory function
} from "@llmbench/core/providers";
```

#### OpenAI

```typescript
const provider = new OpenAIProvider({
  type: "openai",
  name: "GPT-4o",
  model: "gpt-4o",
  // apiKey: resolved from OPENAI_API_KEY env var by default
  temperature: 0,
  maxTokens: 1024,
  timeoutMs: 30000,
});

const response = await provider.generate("What is 2 + 2?");
// { output: "4", latencyMs: 230, tokenUsage: { inputTokens: 12, outputTokens: 1, totalTokens: 13 } }
```

#### Anthropic

```typescript
const provider = new AnthropicProvider({
  type: "anthropic",
  name: "Claude Sonnet",
  model: "claude-sonnet-4-6",
  // apiKey: resolved from ANTHROPIC_API_KEY env var
  maxTokens: 1024,
});

const response = await provider.generate("Explain quantum computing briefly.");
```

#### Google AI

```typescript
const provider = new GoogleProvider({
  type: "google",
  name: "Gemini Flash",
  model: "gemini-2.0-flash",
  // apiKey: resolved from GOOGLE_AI_API_KEY env var
});

const response = await provider.generate("List three prime numbers.");
```

#### Ollama (local models)

```typescript
const provider = new OllamaProvider({
  type: "ollama",
  name: "Llama 3.2",
  model: "llama3.2",
  baseUrl: "http://localhost:11434", // default
});

const response = await provider.generate("What is machine learning?");
```

#### Custom Provider

```typescript
const provider = new CustomProvider(
  { type: "custom", name: "My API", model: "v1" },
  async (input, config) => {
    const res = await fetch("https://my-api.com/generate", {
      method: "POST",
      body: JSON.stringify({ prompt: input }),
    });
    const data = await res.json();
    return {
      output: data.text,
      latencyMs: data.duration_ms,
      tokenUsage: {
        inputTokens: data.input_tokens,
        outputTokens: data.output_tokens,
        totalTokens: data.input_tokens + data.output_tokens,
      },
    };
  },
);
```

#### Factory Function

```typescript
import { createProvider } from "@llmbench/core/providers";

// Automatically picks the right provider class based on config.type
const provider = createProvider({ type: "openai", name: "GPT-4o", model: "gpt-4o" });
```

### Provider Features

All providers inherit from `BaseProvider`, which provides:

- **Config merging** — Override `temperature`, `maxTokens`, etc. per-call via `provider.generate(input, overrides)`
- **Timeout signals** — Uses `AbortSignal.timeout()` (Node 20+) for per-request timeouts
- **API key resolution** — Reads from config or falls back to environment variables
- **Retry with backoff** — OpenAI provider retries on 429/5xx with exponential backoff (1s, 2s, 4s... up to 30s)

## Scorers

### Built-in Scorers

```typescript
import {
  ExactMatchScorer,
  ContainsScorer,
  RegexScorer,
  JsonMatchScorer,
  CosineSimilarityScorer,
  LLMJudgeScorer,
  WeightedAverageScorer,
  createScorer,  // factory function
} from "@llmbench/core/scorers";
```

All scorers implement the `IScorer` interface and return a `ScoreResult` with `value` (0–1), `reason`, and optional `metadata`.

#### Exact Match

```typescript
const scorer = new ExactMatchScorer(); // case-insensitive, trimmed by default
await scorer.score("Paris", "paris");   // { value: 1 }
await scorer.score("Paris", "London");  // { value: 0 }

// With options
const strict = new ExactMatchScorer({ caseSensitive: true, trim: false });
await strict.score("Paris", "paris");   // { value: 0 }
```

#### Contains

```typescript
const scorer = new ContainsScorer(); // case-insensitive by default
await scorer.score("The answer is 42", "42");      // { value: 1 }
await scorer.score("The answer is 42", "43");      // { value: 0 }
await scorer.score("Hello World", "hello");         // { value: 1 }

const strict = new ContainsScorer({ caseSensitive: true });
await strict.score("Hello World", "hello");         // { value: 0 }
```

#### Regex

```typescript
const scorer = new RegexScorer(); // case-insensitive by default
await scorer.score("The answer is 42", "\\d+");     // { value: 1 }
await scorer.score("hello", "^\\d+$");              // { value: 0 }
await scorer.score("test", "[invalid");              // { value: 0, reason: "Invalid regex..." }

const strict = new RegexScorer({ flags: "" }); // case-sensitive
```

#### JSON Match

```typescript
const scorer = new JsonMatchScorer();
// Order-independent comparison
await scorer.score('{"a":1,"b":2}', '{"b":2,"a":1}');  // { value: 1 }
await scorer.score('{"a":1}', '{"a":2}');               // { value: 0 }

// Partial matching: output can have extra fields
const partial = new JsonMatchScorer({ partial: true });
await partial.score('{"a":1,"b":2,"c":3}', '{"a":1,"b":2}');  // { value: 1 }

// Handles invalid JSON gracefully
await scorer.score("not json", '{"a":1}');  // { value: 0, reason: "JSON parse error..." }
```

#### Cosine Similarity

```typescript
const scorer = new CosineSimilarityScorer();
await scorer.score("hello world", "hello world");                     // { value: 1.0 }
await scorer.score("The cat sat on the mat", "The cat is on the mat"); // { value: ~0.85 }
await scorer.score("hello", "xyz");                                    // { value: 0.0 }
```

Uses token-frequency vectors (bag-of-words). Tokenizes on word boundaries, lowercased.

#### LLM Judge

```typescript
import { OpenAIProvider } from "@llmbench/core/providers";

const judgeProvider = new OpenAIProvider({
  type: "openai",
  name: "Judge",
  model: "gpt-4o",
});

const scorer = new LLMJudgeScorer(judgeProvider, {
  name: "Quality Judge",
  // Optional: custom prompt template with {{input}}, {{expected}}, {{output}} placeholders
  promptTemplate: `
    Score the following output on a scale of 0 to 1.
    Input: {{input}}
    Expected: {{expected}}
    Actual: {{output}}
    Return JSON: { "score": <number>, "reason": "<explanation>" }
  `,
});

const result = await scorer.score("The capital is Paris", "Paris", "What is the capital of France?");
// { value: 0.95, reason: "Correct answer with natural phrasing", metadata: { rawJudgement: "..." } }
```

#### Weighted Composite

Combine multiple scorers with custom weights:

```typescript
const scorer = new WeightedAverageScorer([
  { scorer: new ExactMatchScorer(), weight: 3 },
  { scorer: new ContainsScorer(), weight: 1 },
]);

// If exact match fails (0) but contains passes (1):
await scorer.score("The answer is 42", "42");
// { value: 0.25 }  (0*3 + 1*1) / (3+1)

// Metadata includes per-scorer breakdown:
// metadata.componentScores = [
//   { name: "Exact Match", value: 0, weight: 3 },
//   { name: "Contains", value: 1, weight: 1 }
// ]
```

#### Factory Function

```typescript
import { createScorer } from "@llmbench/core/scorers";

const scorer = createScorer({
  id: "exact",
  name: "Exact Match",
  type: "exact-match",
  options: { caseSensitive: true },
});
```

## Cost Calculation

```typescript
import { CostCalculator } from "@llmbench/core/cost";

const calculator = new CostCalculator();

const estimate = calculator.calculate("gpt-4o", "openai", {
  inputTokens: 1000,
  outputTokens: 500,
  totalTokens: 1500,
});

// { inputCost: 0.0025, outputCost: 0.005, totalCost: 0.0075, currency: "USD" }
```

Built-in pricing for 16+ models across OpenAI, Anthropic, and Google AI. Unknown models return `$0` with a console warning.

## Run Comparison

```typescript
import { RunComparator } from "@llmbench/core/comparison";

const comparator = new RunComparator(evalRunRepo, evalResultRepo, scoreRepo);
const result = await comparator.compare(runIdA, runIdB);

// result.scorerComparisons — per-scorer average score delta
// result.costComparison    — total cost delta and % change
// result.latencyComparison — avg latency delta and % change
// result.regressions       — test cases where Run B scored worse
//   severity: "high" (delta < -0.3) | "medium" (< -0.15) | "low" (< -0.05)
```

## Config Loading

```typescript
import { loadConfig, mergeWithDefaults } from "@llmbench/core/config";

// Auto-detects llmbench.config.ts, .js, or .mjs in cwd
const config = await loadConfig();

// Or specify a path
const config2 = await loadConfig("./path/to/config.ts");

// Apply defaults (dbPath, port, concurrency, retries, timeout)
const full = mergeWithDefaults(config);
```

## Engine Internals

The `EvaluationEngine` handles:

- **Concurrency** — `ConcurrencyManager` limits parallel provider calls (configurable per run)
- **Retries** — `RetryHandler` with exponential backoff (1s base, 30s max, configurable max retries)
- **Events** — `EventBus` emits typed events throughout the pipeline (`run:started`, `case:completed`, `run:progress`, etc.)
- **Scoring** — All scorers run sequentially per result, scores saved to DB
- **Cost tracking** — Calculated per request using the built-in pricing table

## Subpath Exports

| Import path | Contents |
|-------------|----------|
| `@llmbench/core` | All public exports |
| `@llmbench/core/providers` | Provider classes + `createProvider` factory |
| `@llmbench/core/scorers` | Scorer classes + `createScorer` factory |
| `@llmbench/core/engine` | `EvaluationEngine`, `EventBus`, `ConcurrencyManager`, `RetryHandler` |
| `@llmbench/core/cost` | `CostCalculator`, `PRICING_TABLE` |
| `@llmbench/core/comparison` | `RunComparator` |
| `@llmbench/core/config` | `loadConfig`, `validateConfig`, `mergeWithDefaults`, `DEFAULT_CONFIG` |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
