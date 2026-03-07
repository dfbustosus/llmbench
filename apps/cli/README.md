<div align="center">

# @llmbench/cli

**Evaluate, compare, and benchmark LLMs from your terminal.**

[![npm version](https://img.shields.io/npm/v/@llmbench/cli.svg)](https://www.npmjs.com/package/@llmbench/cli)
[![npm downloads](https://img.shields.io/npm/dm/@llmbench/cli.svg)](https://www.npmjs.com/package/@llmbench/cli)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)

</div>

---

## Quick Start

```bash
npx @llmbench/cli init
export OPENAI_API_KEY=sk-...
npx @llmbench/cli run -d datasets/example.json
npx @llmbench/cli serve
```

Four commands to go from zero to a full LLM evaluation with a web dashboard at `http://localhost:3000`.

## Installation

```bash
# Run directly (no install)
npx @llmbench/cli init

# Or install as a project dependency
npm install @llmbench/cli

# Or globally
npm install -g @llmbench/cli
```

## Features

- **Multi-provider** — Run the same prompts against OpenAI, Anthropic, Google AI, Ollama, or any custom provider
- **Scoring engine** — Exact match, contains, regex, JSON deep compare, cosine similarity, LLM-as-judge
- **Regression detection** — Compare any two runs to catch score regressions, cost increases, and latency changes
- **Cost tracking** — Per-request token counts and cost breakdowns with built-in pricing tables
- **Web dashboard** — Charts, drill-down results, and run comparisons at `localhost:3000`
- **Local-first** — Single SQLite file, no cloud accounts, no data leaving your machine
- **TypeScript config** — Full type safety and autocompletion

## CLI Reference

| Command | Description |
|---------|-------------|
| `llmbench init` | Scaffold config file and example dataset |
| `llmbench run -d <dataset>` | Run evaluation against a dataset |
| `llmbench run -d <dataset> --concurrency 10` | Run with custom concurrency |
| `llmbench list` | List all evaluation runs |
| `llmbench list --project <name>` | Filter runs by project |
| `llmbench compare <runA> <runB>` | Compare two runs with regression detection |
| `llmbench serve` | Launch web dashboard on `localhost:3000` |
| `llmbench serve -p 8080` | Launch on a custom port |

## Configuration

Create `llmbench.config.ts` in your project root (or run `llmbench init`):

```typescript
import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "my-eval-project",
  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
    { type: "anthropic", name: "Claude Sonnet", model: "claude-sonnet-4-6" },
  ],
  scorers: [
    { id: "exact-match", name: "Exact Match", type: "exact-match" },
    { id: "contains", name: "Contains", type: "contains" },
  ],
  defaults: {
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },
};

export default config;
```

## Providers

| Provider | Config type | Environment Variable |
|----------|-------------|---------------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google AI | `google` | `GOOGLE_AI_API_KEY` |
| Ollama | `ollama` | None (local) |
| Custom | `custom` | User-defined |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | UI component library for the dashboard |

## Documentation

Full documentation, configuration guide, and contributing instructions at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
