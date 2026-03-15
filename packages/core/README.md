<div align="center">

# @llmbench/core

**Evaluation engine, providers, scorers, and SDK for the LLMBench platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/core.svg)](https://www.npmjs.com/package/@llmbench/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This is the core engine that powers LLMBench. Use it directly if you want to build custom evaluation pipelines, integrate with your own tooling, or embed LLM evaluation into your application.

## Installation

```bash
npm install @llmbench/core
```

## SDK — One-Call Evaluation

The simplest way to run evaluations programmatically:

### `evaluate()`

```typescript
import { evaluate } from "@llmbench/core";

const result = await evaluate({
  testCases: [
    { input: "What is 2+2?", expected: "4" },
    { input: "Capital of France?", expected: "Paris" },
  ],
  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
  ],
  scorers: [
    { id: "exact-match", name: "Exact Match", type: "exact-match" },
    { id: "contains", name: "Contains", type: "contains" },
  ],
});

console.log(result.status);          // "completed"
console.log(result.summary);         // { totalCases, completedCases, failedCases, totalCost, ... }
console.log(result.scorerAverages);  // { "exact-match": 1.0, "contains": 1.0 }
```

**`EvaluateOptions`**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `testCases` | `SimpleTestCase[]` | Yes | -- | Array of test cases |
| `providers` | `ProviderConfig[]` | Yes | -- | Array of providers |
| `scorers` | `ScorerConfig[]` | No | `[exact-match]` | Scorers; `[]` = no scoring |
| `onEvent` | `(event) => void` | No | -- | Event listener for progress |
| `concurrency` | `number` | No | `5` | Parallel evaluations |
| `maxRetries` | `number` | No | `3` | Retries on transient errors |
| `timeoutMs` | `number` | No | `30000` | Per-request timeout |
| `db` | `LLMBenchDB` | No | -- | Pre-existing DB handle |
| `dbPath` | `string` | No | in-memory | Persistent DB path |
| `projectName` | `string` | No | `sdk-eval` | Project name |
| `datasetName` | `string` | No | `sdk-dataset` | Dataset name |
| `customProviders` | `Map<string, fn>` | No | -- | Custom provider functions |
| `cache` | `{ ttlHours? }` | No | -- | Enable caching with TTL |

**`SimpleTestCase`**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | `string` | Yes | Prompt text |
| `expected` | `string` | No | Expected output for global scorers |
| `messages` | `ChatMessage[]` | No | Multi-turn conversation |
| `context` | `object` | No | Template interpolation variables |
| `tags` | `string[]` | No | Tags |
| `assert` | `TestCaseAssertion[]` | No | Per-test-case assertions (override global scorers) |

### `evaluateQuick()`

Convenience wrapper for single-prompt evaluation:

```typescript
import { evaluateQuick } from "@llmbench/core";

const result = await evaluateQuick({
  prompt: "What is the meaning of life?",
  expected: "42",
  providers: [{ type: "openai", name: "GPT-4o", model: "gpt-4o" }],
});
```

### Per-Test-Case Assertions

Test cases can override global scorers with inline assertions:

```typescript
const result = await evaluate({
  testCases: [
    {
      input: "Name a color",
      assert: [
        { type: "regex", value: "(red|blue|green|yellow)" },
        { type: "contains", value: "color" },
      ],
    },
    {
      input: "What is 2+2?",
      expected: "4",  // uses global scorers
    },
  ],
  providers: [{ type: "openai", name: "GPT", model: "gpt-4o" }],
  scorers: [{ id: "exact-match", name: "Exact Match", type: "exact-match" }],
});
```

When `assert` is present, those assertions replace global scorers for that test case. Each assertion specifies its own expected value via the `value` field.

### Custom Providers via SDK

```typescript
const result = await evaluate({
  testCases: [{ input: "Hello", expected: "Hi" }],
  providers: [{ type: "custom", name: "MyAPI", model: "v1" }],
  customProviders: new Map([
    ["MyAPI", async (input) => ({
      output: "Hi there!",
      latencyMs: 50,
      tokenUsage: { inputTokens: 5, outputTokens: 3, totalTokens: 8 },
    })],
  ]),
});
```

## Config & Dataset Loading

### Config Loading

```typescript
import { loadConfig, mergeWithDefaults } from "@llmbench/core/config";

// Auto-detects llmbench.config.ts, .js, .mjs, .yaml, or .yml in cwd
const config = await loadConfig();

// Or specify a path (YAML or TypeScript)
const config2 = await loadConfig("./path/to/config.yaml");

// Apply defaults (dbPath, port, concurrency, retries, timeout)
const full = mergeWithDefaults(config);
```

### Dataset Loading

```typescript
import { loadDataset } from "@llmbench/core/config";

// Auto-detects JSON or YAML by extension
const dataset = loadDataset("./datasets/qa.yaml");

// dataset.name        — dataset name
// dataset.testCases   — array of test cases with input, expected, assert, etc.
```

Validates all fields including per-test-case assertions. Throws descriptive errors for invalid data.

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
  maxTokens: 1024,
});
```

#### Google AI

```typescript
const provider = new GoogleProvider({
  type: "google",
  name: "Gemini Flash",
  model: "gemini-2.0-flash",
});
```

#### Ollama (local models)

```typescript
const provider = new OllamaProvider({
  type: "ollama",
  name: "Llama 3.2",
  model: "llama3.2",
  baseUrl: "http://localhost:11434", // default
});
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
- **System messages** — Supports `systemMessage` with `{{variable}}` interpolation
- **Retry with backoff** — Retries on 429/5xx with exponential backoff (1s, 2s, 4s... up to 30s)

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

All scorers implement `IScorer` and return `ScoreResult` with `value` (0-1), `reason`, and optional `metadata`.

#### Exact Match

```typescript
const scorer = new ExactMatchScorer(); // case-insensitive, trimmed by default
await scorer.score("Paris", "paris");   // { value: 1 }
await scorer.score("Paris", "London");  // { value: 0 }

const strict = new ExactMatchScorer({ caseSensitive: true, trim: false });
await strict.score("Paris", "paris");   // { value: 0 }
```

#### Contains

```typescript
const scorer = new ContainsScorer();
await scorer.score("The answer is 42", "42");   // { value: 1 }
await scorer.score("Hello World", "hello");      // { value: 1 }

const strict = new ContainsScorer({ caseSensitive: true });
await strict.score("Hello World", "hello");      // { value: 0 }
```

#### Regex

```typescript
const scorer = new RegexScorer(); // case-insensitive by default
await scorer.score("The answer is 42", "\\d+");  // { value: 1 }
await scorer.score("hello", "^\\d+$");           // { value: 0 }
```

#### JSON Match

```typescript
const scorer = new JsonMatchScorer();
await scorer.score('{"a":1,"b":2}', '{"b":2,"a":1}');  // { value: 1 } — order independent

const partial = new JsonMatchScorer({ partial: true });
await partial.score('{"a":1,"b":2,"c":3}', '{"a":1,"b":2}');  // { value: 1 }
```

#### Cosine Similarity

```typescript
const scorer = new CosineSimilarityScorer();
await scorer.score("hello world", "hello world");                     // { value: 1.0 }
await scorer.score("The cat sat on the mat", "The cat is on the mat"); // { value: ~0.85 }
```

#### LLM Judge

```typescript
const judgeProvider = new OpenAIProvider({
  type: "openai", name: "Judge", model: "gpt-4o",
});

const scorer = new LLMJudgeScorer(judgeProvider, {
  name: "Quality Judge",
  promptTemplate: `Score 0-1. Input: {{input}} Expected: {{expected}} Actual: {{output}}
Return JSON: { "score": <number>, "reason": "<explanation>" }`,
});
```

#### Weighted Composite

```typescript
const scorer = new WeightedAverageScorer([
  { scorer: new ExactMatchScorer(), weight: 3 },
  { scorer: new ContainsScorer(), weight: 1 },
]);
// If exact=0, contains=1: value = (0*3 + 1*1) / (3+1) = 0.25
```

## Cost Calculation

```typescript
import { CostCalculator } from "@llmbench/core/cost";

const calculator = new CostCalculator();
const estimate = calculator.calculate("gpt-4o", "openai", {
  inputTokens: 1000, outputTokens: 500, totalTokens: 1500,
});
// { inputCost: 0.0025, outputCost: 0.005, totalCost: 0.0075, currency: "USD" }
```

Built-in pricing for 50+ models across OpenAI, Anthropic, and Google AI.

## CI Gates

```typescript
import { ThresholdGate } from "@llmbench/core/gate";

const gate = new ThresholdGate({
  minScore: 0.8,
  maxFailureRate: 0.1,
  maxCost: 5.00,
  maxLatencyMs: 10000,
  scorerThresholds: { "exact-match": 0.9 },
});

const result = gate.evaluateRun(run, scoresByResultId);
// { passed: true/false, violations: [{ gate, threshold, actual, message }] }
```

## Run Comparison

```typescript
import { RunComparator } from "@llmbench/core/comparison";

const comparator = new RunComparator(evalRunRepo, evalResultRepo, scoreRepo);
const result = await comparator.compare(runIdA, runIdB);

// result.scorerComparisons — per-scorer average score delta
// result.costComparison    — total cost delta and % change
// result.latencyComparison — avg latency delta and % change
// result.regressions       — test cases where Run B scored worse
//   severity: "high" (>30% drop) | "medium" (>15%) | "low" (>5%)
```

## Engine Internals

The `EvaluationEngine` handles:

- **Concurrency** — `ConcurrencyManager` limits parallel provider calls (configurable per run)
- **Retries** — `RetryHandler` with exponential backoff (1s base, 30s max, configurable max retries)
- **Events** — `EventBus` emits typed events: `run:started`, `case:started`, `case:completed`, `case:failed`, `run:progress`, `run:completed`, `run:failed`
- **Per-test-case assertions** — When a test case has `assert[]`, inline scorers override global scorers. Invalid inline types (llm-judge, composite) fail fast before making API calls.
- **Template interpolation** — `{{variable}}` substitution in prompts and system messages using test case context
- **Caching** — SHA-256 keyed response cache with optional TTL, stored in SQLite
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
| `@llmbench/core/gate` | `ThresholdGate` |
| `@llmbench/core/config` | `loadConfig`, `loadDataset`, `validateConfig`, `mergeWithDefaults` |
| `@llmbench/core/sdk` | `evaluate`, `evaluateQuick` |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
