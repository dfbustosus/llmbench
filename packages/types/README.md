<div align="center">

# @llmbench/types

**TypeScript type definitions for the LLMBench evaluation platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/types.svg)](https://www.npmjs.com/package/@llmbench/types)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This package provides all the shared TypeScript interfaces and types used across the LLMBench ecosystem.

## Installation

```bash
npm install @llmbench/types
```

## Usage

```typescript
import type { LLMBenchConfig, ProviderConfig, ScorerConfig } from "@llmbench/types";
import type { Dataset, TestCase } from "@llmbench/types/dataset";
import type { EvaluationRun, EvaluationResult } from "@llmbench/types/evaluation";
import type { CostBreakdown } from "@llmbench/types/cost";
```

## Exports

| Export | Description |
|--------|-------------|
| `@llmbench/types` | Main config types (`LLMBenchConfig`, `ProviderConfig`, `ScorerConfig`) |
| `@llmbench/types/provider` | Provider-related types |
| `@llmbench/types/scoring` | Scorer configuration and result types |
| `@llmbench/types/evaluation` | Evaluation run and result types |
| `@llmbench/types/dataset` | Dataset and test case types |
| `@llmbench/types/cost` | Cost tracking and token usage types |
| `@llmbench/types/events` | Event emitter types |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |

## Documentation

Full documentation at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
