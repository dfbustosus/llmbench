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

Four commands: zero to a full LLM evaluation with a web dashboard at `http://localhost:3000`.

## Installation

```bash
# Run directly (no install)
npx @llmbench/cli init

# Or install as a project dependency
npm install @llmbench/cli

# Or globally
npm install -g @llmbench/cli
```

**Requirements:** Node.js >= 20

## Features

- **Multi-provider** — Run the same prompts against OpenAI, Anthropic, Google AI, Ollama, or any custom provider. Compare side-by-side.
- **7 built-in scorers** — Exact match, contains, regex, JSON deep compare, cosine similarity, LLM-as-judge, weighted composite.
- **Regression detection** — Compare any two runs to catch score drops, cost increases, and latency changes with severity levels.
- **Cost tracking** — Per-request token counts and USD cost breakdowns with built-in pricing for 16+ models.
- **Web dashboard** — Next.js app with charts, drill-down results, and run comparisons. Launches with `llmbench serve`.
- **Local-first** — Everything stored in a single SQLite file. No cloud, no external services, no data leaving your machine.
- **TypeScript config** — Full type safety and autocompletion. No YAML, no JSON schemas.

## CLI Reference

### `llmbench init`

Scaffold a new project with config file and example dataset.

```bash
llmbench init                    # default project name
llmbench init --name my-project  # custom name
```

Creates:
- `llmbench.config.ts` — Configuration with OpenAI provider and two default scorers
- `datasets/example.json` — 3 sample test cases (France capital, 2+2, Shakespeare)

### `llmbench run`

Execute an evaluation against one or more LLM providers.

```bash
llmbench run -d datasets/example.json
llmbench run -d datasets/qa.json --concurrency 10
llmbench run -d datasets/qa.json --tags "v2,gpt4o"
llmbench run -d datasets/qa.json --config ./custom-config.ts
```

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --dataset <path>` | Path to dataset JSON file | *required* |
| `-c, --config <path>` | Path to config file | auto-detected |
| `--concurrency <n>` | Parallel evaluations | `5` |
| `--tags <tags>` | Comma-separated run tags | — |

**Output:** A color-coded results table showing input, expected output, actual output, scores for each scorer, latency, and cost per request.

### `llmbench list`

List all past evaluation runs.

```bash
llmbench list
llmbench list --project my-project
llmbench list --limit 50
llmbench list --db ./custom.db
```

| Flag | Description | Default |
|------|-------------|---------|
| `--project <name>` | Filter by project name (substring match) | all |
| `--limit <n>` | Max runs per project | `20` |
| `--db <path>` | Database file path | `./llmbench.db` |

### `llmbench compare`

Compare two evaluation runs with regression detection.

```bash
llmbench compare abc123 def456
llmbench compare abc123 def456 --db ./custom.db
```

**Output:**
- **Score comparison** — Average score per scorer for each run, with delta and % change
- **Cost comparison** — Total cost delta
- **Latency comparison** — Average latency delta
- **Regressions** — Test cases where Run B scored lower, with severity levels (high/medium/low)

### `llmbench serve`

Launch the web dashboard.

```bash
llmbench serve                   # localhost:3000
llmbench serve -p 8080           # custom port
llmbench serve --db ./custom.db  # custom database
```

## Configuration

`llmbench init` creates `llmbench.config.ts`. Here's a full example:

```typescript
import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "my-eval-project",
  description: "Comparing GPT-4o vs Claude Sonnet on QA tasks",

  // Optional: custom database path and dashboard port
  // dbPath: "./my-evals.db",
  // port: 8080,

  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
    { type: "openai", name: "GPT-4o Mini", model: "gpt-4o-mini" },
    { type: "anthropic", name: "Claude Sonnet", model: "claude-sonnet-4-6" },
    { type: "google", name: "Gemini Flash", model: "gemini-2.0-flash" },
    {
      type: "ollama",
      name: "Llama 3.2",
      model: "llama3.2",
      baseUrl: "http://localhost:11434", // default
    },
  ],

  scorers: [
    { id: "exact", name: "Exact Match", type: "exact-match" },
    { id: "contains", name: "Contains", type: "contains" },
    { id: "regex", name: "Regex", type: "regex" },
    {
      id: "json",
      name: "JSON Match",
      type: "json-match",
      options: { partial: true }, // allow extra fields in output
    },
    { id: "cosine", name: "Similarity", type: "cosine-similarity" },
  ],

  defaults: {
    concurrency: 5,     // parallel requests per provider
    maxRetries: 3,       // retry on transient errors
    timeoutMs: 30000,    // 30s timeout per request
  },
};

export default config;
```

## Dataset Format

Create a JSON file with your test cases:

```json
{
  "name": "QA Dataset",
  "testCases": [
    {
      "input": "What is the capital of France?",
      "expected": "Paris"
    },
    {
      "input": "Summarize this: The quick brown fox jumps over the lazy dog.",
      "expected": "A fox jumps over a dog.",
      "tags": ["summarization"]
    },
    {
      "input": "Translate to French: Hello",
      "expected": "Bonjour",
      "context": { "difficulty": "easy", "category": "translation" }
    }
  ]
}
```

Each test case requires `input` and `expected` (both strings). Optional fields: `tags` (string array) and `context` (arbitrary metadata).

## Providers

| Provider | Config `type` | Environment Variable | Models |
|----------|--------------|---------------------|--------|
| OpenAI | `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-4-turbo, o1, o3-mini |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001 |
| Google AI | `google` | `GOOGLE_AI_API_KEY` | gemini-2.0-flash, gemini-1.5-pro, gemini-1.5-flash |
| Ollama | `ollama` | None (local) | Any model pulled locally |
| Custom | `custom` | User-defined | Bring your own |

All providers support optional overrides: `temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty`, `stopSequences`, `timeoutMs`, `baseUrl`.

API keys are read from environment variables only. They are never stored in the database or config files.

## Scorers

| Scorer | Config `type` | Score Range | Description |
|--------|--------------|-------------|-------------|
| Exact Match | `exact-match` | 0 or 1 | Binary match (case-insensitive, trimmed by default) |
| Contains | `contains` | 0 or 1 | Checks if output contains the expected text |
| Regex | `regex` | 0 or 1 | Tests expected as a regex pattern against the output |
| JSON Match | `json-match` | 0 or 1 | Deep JSON comparison; supports `{ partial: true }` for subset matching |
| Cosine Similarity | `cosine-similarity` | 0.0–1.0 | Token-frequency vector similarity |
| LLM Judge | `llm-judge` | 0.0–1.0 | Uses an LLM to evaluate output against a custom rubric |
| Weighted Composite | `composite` | 0.0–1.0 | Combine multiple scorers with custom weights |

## Cost Tracking

Built-in pricing for 16+ models. Cost is calculated automatically per request:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|----------------------|
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| gemini-2.0-flash | $0.10 | $0.40 |

## Try Without API Keys

Run the built-in demo to see the full pipeline with fake providers:

```bash
cd apps/cli
pnpm demo
```

This creates a temporary database, runs two evaluations with simulated models (90% vs 50% accuracy), and shows the comparison with regression detection.

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library for the dashboard |

## Documentation

Full documentation, architecture details, and contributing instructions at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
