<div align="center">

# @llmbench/types

**TypeScript type definitions for the LLMBench evaluation platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/types.svg)](https://www.npmjs.com/package/@llmbench/types)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

Shared TypeScript interfaces, types, and enums used across all LLMBench packages. Install this if you're building custom providers, scorers, or integrations.

## Installation

```bash
npm install @llmbench/types
```

## Usage

### Main Config

```typescript
import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "my-eval-project",
  description: "Optional description",
  dbPath: "./llmbench.db",     // default: "./llmbench.db"
  port: 3000,                   // default: 3000
  providers: [/* ... */],
  scorers: [/* ... */],
  defaults: {
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },
};
```

### Provider Types

```typescript
import type {
  ProviderConfig,
  ProviderResponse,
  ProviderType,
  TokenUsage,
  IProvider,
} from "@llmbench/types";

// ProviderType = "openai" | "azure-openai" | "anthropic" | "google" | "mistral"
//              | "together" | "bedrock" | "ollama" | "custom"

const config: ProviderConfig = {
  type: "openai",
  name: "GPT-4o",
  model: "gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,    // optional, resolved from env
  baseUrl: "https://api.openai.com/v1",  // optional override
  temperature: 0,
  maxTokens: 1024,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  stopSequences: ["\n\n"],
  timeoutMs: 30000,
  extra: {},  // pass-through for provider-specific options
};

// Implement custom providers with the IProvider interface
const provider: IProvider = {
  type: "custom",
  name: "My Provider",
  model: "my-model",
  async generate(input: string): Promise<ProviderResponse> {
    return {
      output: "response text",
      latencyMs: 150,
      tokenUsage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      rawResponse: {}, // optional: store the full API response
    };
  },
};
```

### Scorer Types

```typescript
import type {
  ScorerConfig,
  ScorerType,
  ScoreResult,
  IScorer,
} from "@llmbench/types";

// ScorerType = "exact-match" | "contains" | "regex" | "json-match"
//            | "cosine-similarity" | "llm-judge" | "composite" | "custom"

const config: ScorerConfig = {
  id: "my-scorer",
  name: "My Scorer",
  type: "exact-match",
  weight: 1.0,                    // optional, for composite scoring
  options: { caseSensitive: true }, // optional, scorer-specific
};

// Implement custom scorers with the IScorer interface
const scorer: IScorer = {
  id: "length-check",
  name: "Length Check",
  type: "custom",
  async score(output: string, expected: string, input?: string): Promise<ScoreResult> {
    const ratio = Math.min(output.length / expected.length, 1);
    return {
      scorerId: "length-check",
      scorerName: "Length Check",
      scorerType: "custom",
      value: ratio,        // 0-1 normalized
      rawValue: ratio,     // optional: unnormalized value
      reason: `Output is ${(ratio * 100).toFixed(0)}% of expected length`,
      metadata: { outputLen: output.length, expectedLen: expected.length },
    };
  },
};
```

### Dataset & Test Case Types

```typescript
import type { Dataset, TestCase } from "@llmbench/types";

const dataset: Dataset = {
  id: "ds_abc123",
  projectId: "proj_xyz",
  name: "QA Dataset",
  description: "General knowledge questions",
  version: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
};

const testCase: TestCase = {
  id: "tc_001",
  datasetId: "ds_abc123",
  input: "What is the capital of France?",
  expected: "Paris",
  context: { difficulty: "easy" },  // optional metadata
  tags: ["geography", "europe"],     // optional tags
  orderIndex: 0,
};
```

### Evaluation Types

```typescript
import type { EvalRun, EvalRunConfig, EvalResult, EvalStatus } from "@llmbench/types";

// EvalStatus = "pending" | "running" | "completed" | "failed" | "cancelled"
// CancellationError — sentinel error class thrown when an AbortSignal is aborted

const runConfig: EvalRunConfig = {
  providerIds: ["prov_001", "prov_002"],
  scorerConfigs: [],
  concurrency: 5,
  maxRetries: 3,
  timeoutMs: 30000,
};

// EvalResult includes per-request details:
// - input, output, expected, error
// - latencyMs, tokenUsage ({ inputTokens, outputTokens, totalTokens })
// - cost (USD), rawResponse
```

### Event Types

```typescript
import type { EvalEvent } from "@llmbench/types";

// EvalEvent is a union of:
//   RunStartedEvent      { type: "run:started", runId, totalCases, timestamp }
//   CaseStartedEvent     { type: "case:started", runId, testCaseId, providerId, timestamp }
//   CaseCompletedEvent   { type: "case:completed", runId, testCaseId, providerId, latencyMs, scores, timestamp }
//   CaseFailedEvent      { type: "case:failed", runId, testCaseId, providerId, error, timestamp }
//   RunProgressEvent     { type: "run:progress", runId, completedCases, totalCases, failedCases, timestamp }
//   RunCompletedEvent    { type: "run:completed", runId, totalCases, failedCases, avgScore, totalCost, timestamp }
//   RunFailedEvent       { type: "run:failed", runId, error, timestamp }
//   RunCancelledEvent    { type: "run:cancelled", runId, completedCases, totalCases, failedCases, timestamp }
//   RescoreStartedEvent  { type: "rescore:started", runId, totalResults, timestamp }
//   RescoreProgressEvent { type: "rescore:progress", runId, completedResults, totalResults, timestamp }
//   RescoreCompletedEvent { type: "rescore:completed", runId, totalResults, scorerAverages, timestamp }

function handleEvent(event: EvalEvent) {
  switch (event.type) {
    case "case:completed":
      console.log(`Test ${event.testCaseId}: scores`, event.scores);
      break;
    case "run:completed":
      console.log(`Run done. Avg score: ${event.avgScore}, cost: $${event.totalCost}`);
      break;
  }
}
```

### Comparison Types

```typescript
import type {
  ComparisonResult,
  ScorerComparison,
  CostComparison,
  LatencyComparison,
  Regression,
  RegressionReport,
} from "@llmbench/types";

// ComparisonResult contains:
//   - scorerComparisons: per-scorer avg score deltas
//   - costComparison: total cost delta
//   - latencyComparison: avg latency delta
//   - regressions: test cases where Run B scored worse
//     severity: "low" (delta < -0.05) | "medium" (< -0.15) | "high" (< -0.3)
```

### Cost Types

```typescript
import type { CostEstimate, CostRecord, ModelPricing } from "@llmbench/types";

const pricing: ModelPricing = {
  model: "gpt-4o",
  provider: "openai",
  inputPricePerMillion: 2.5,
  outputPricePerMillion: 10,
};

// CostEstimate: { inputCost, outputCost, totalCost, currency: "USD" }
// CostRecord: full record with id, runId, providerId, model, tokens, costs, createdAt
```

## Subpath Exports

| Import path | Contents |
|-------------|----------|
| `@llmbench/types` | `LLMBenchConfig`, `ProviderConfig`, `ScorerConfig`, and all re-exports |
| `@llmbench/types/provider` | `ProviderType`, `ProviderConfig`, `ProviderResponse`, `TokenUsage`, `IProvider` |
| `@llmbench/types/scoring` | `ScorerType`, `ScorerConfig`, `ScoreResult`, `IScorer` |
| `@llmbench/types/evaluation` | `EvalStatus`, `EvalRun`, `EvalRunConfig`, `EvalResult` |
| `@llmbench/types/dataset` | `Dataset`, `TestCase` |
| `@llmbench/types/cost` | `CostEstimate`, `CostRecord`, `ModelPricing`, `TokenUsage` |
| `@llmbench/types/events` | `EvalEvent` and all event subtypes |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
