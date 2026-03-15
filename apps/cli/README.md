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

Or test a single prompt without any files:

```bash
llmbench eval "What is the capital of France?" -p openai:gpt-4o
```

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

- **Multi-provider** — Run the same prompts against OpenAI, Anthropic, Google AI, Ollama, or any custom provider.
- **7 built-in scorers** — Exact match, contains, regex, JSON deep compare, cosine similarity, LLM-as-judge, weighted composite.
- **Per-test-case assertions** — Override global scorers per test case with inline `assert` rules and custom expected values.
- **Quick eval mode** — Test a single prompt ad-hoc: `llmbench eval "prompt" -p openai:gpt-4o`.
- **YAML or TypeScript config** — Use `llmbench.config.yaml` or `llmbench.config.ts`. Datasets support both JSON and YAML.
- **Export & reporting** — Export results to JSON, CSV, or self-contained HTML. `--json` for CI pipelines.
- **CI gates** — Score thresholds, failure rate limits, cost budgets, latency caps. Exit code 1 on violations.
- **Regression detection** — Compare any two runs with severity-based regression gating.
- **Response caching** — SHA-256 keyed cache avoids duplicate API calls. TTL-based expiry.
- **Cost tracking** — Per-request token counts and USD cost with built-in pricing for 50+ models.
- **Prompt templates** — `{{variable}}` interpolation in prompts and system messages.
- **Dataset versioning** — Content-hashed datasets with automatic version tracking.
- **Web dashboard** — Next.js app with charts, drill-down results, and run comparisons.
- **Local-first** — Everything in a single SQLite file. No cloud, no external services.

## CLI Reference

### `llmbench init`

Scaffold a new project with config file and example dataset.

```bash
llmbench init                          # TypeScript config + JSON dataset
llmbench init --name my-project        # Custom project name
llmbench init --format yaml            # YAML config + YAML dataset (with assertion examples)
```

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --name <name>` | Project name | `my-eval-project` |
| `-f, --format <format>` | Config format: `ts` or `yaml` | `ts` |

Creates:
- `llmbench.config.ts` (or `.yaml`) — Configuration with provider and scorer defaults
- `datasets/example.json` (or `.yaml`) — Sample test cases (YAML includes assertion examples)

### `llmbench run`

Execute an evaluation against one or more LLM providers.

```bash
llmbench run -d datasets/qa.json
llmbench run -d datasets/qa.yaml --concurrency 10
llmbench run -d data.yaml --threshold 0.8 --max-failure-rate 0.1
llmbench run -d data.json -o results.html --json
llmbench run -d data.json --no-cache --tags "v2,gpt4o"
llmbench run -d data.json --clear-cache
```

| Flag | Description | Default |
|------|-------------|---------|
| `-d, --dataset <path>` | Path to dataset file (.json, .yaml, .yml) | *required* |
| `-c, --config <path>` | Path to config file | auto-detected |
| `--concurrency <n>` | Parallel evaluations | `5` |
| `--tags <tags>` | Comma-separated run tags | -- |
| `--threshold <score>` | Minimum average score (0-1); exit 1 on failure | -- |
| `--max-failure-rate <rate>` | Maximum failure rate (0-1); exit 1 if exceeded | -- |
| `--no-cache` | Disable response caching | -- |
| `--clear-cache` | Clear all cached responses before running | -- |
| `--json` | Output results as JSON (for CI pipelines) | -- |
| `-o, --output <file>` | Export to file (.json, .csv, .html) | -- |

**Output:** A color-coded results table showing input, expected, output, scores per scorer, latency, and cost.

### `llmbench eval`

Quick inline evaluation. Test a prompt ad-hoc without creating dataset files.

```bash
# Basic usage
llmbench eval "What is the capital of France?" -p openai:gpt-4o

# Multiple providers
llmbench eval "Explain quantum computing" -p openai:gpt-4o -p anthropic:claude-sonnet-4-6

# With scoring
llmbench eval "What is 2+2?" -p openai:gpt-4o -e "4" -s exact-match -s contains

# With system message and temperature
llmbench eval "Write a haiku" -p openai:gpt-4o --system "You are a poet" -t 0.9

# Pipe from stdin
echo "Translate to French: Hello" | llmbench eval -p openai:gpt-4o

# JSON output, no DB persistence
llmbench eval "prompt" -p openai:gpt-4o --json --no-save

# Export results
llmbench eval "prompt" -p openai:gpt-4o -o results.html
```

| Flag | Description | Default |
|------|-------------|---------|
| `[prompt]` | Prompt text (or pipe via stdin) | -- |
| `-p, --provider <type:model>` | Provider shorthand, repeatable | *required* |
| `-e, --expected <text>` | Expected output for scoring | -- |
| `-s, --scorer <type>` | Scorer type, repeatable | auto: `exact-match` if `-e` given |
| `--system <text>` | System message | -- |
| `-t, --temperature <n>` | Temperature (0-2) | -- |
| `--max-tokens <n>` | Max output tokens | -- |
| `--json` | Output as JSON | -- |
| `--no-save` | Skip DB persistence (fast path) | -- |
| `-c, --config <path>` | Config file path | auto-detected |
| `-o, --output <file>` | Export to file (.json, .csv, .html) | -- |

**Provider shorthand format:** `type:model` — e.g., `openai:gpt-4o`, `anthropic:claude-sonnet-4-6`, `ollama:llama3.2`, `google:gemini-2.0-flash`.

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
llmbench compare abc123 def456 --fail-on-regression
llmbench compare abc123 def456 --fail-on-regression --min-severity medium
llmbench compare abc123 def456 --json -o comparison.html
```

| Flag | Description | Default |
|------|-------------|---------|
| `<runIdA>` | First run ID | *required* |
| `<runIdB>` | Second run ID | *required* |
| `--db <path>` | Database file path | `./llmbench.db` |
| `--fail-on-regression` | Exit 1 if regressions detected | -- |
| `--min-severity <level>` | Minimum severity: `low`, `medium`, `high` | `low` |
| `--json` | Output as JSON | -- |
| `-o, --output <file>` | Export to file (.json, .csv, .html) | -- |

**Output:**
- Score comparison per scorer (delta + % change)
- Cost comparison (delta + % change)
- Latency comparison (delta + % change)
- Regressions table with severity levels: high (>30% drop), medium (>15%), low (>5%)

### `llmbench serve`

Launch the web dashboard.

```bash
llmbench serve                   # localhost:3000
llmbench serve -p 8080           # custom port
llmbench serve --db ./custom.db  # custom database
```

## Configuration

LLMBench searches for config files in order: `llmbench.config.ts` > `.js` > `.mjs` > `.yaml` > `.yml`. Override with `--config <path>`.

### TypeScript Config

```typescript
import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "my-eval-project",
  description: "Comparing GPT-4o vs Claude Sonnet on QA tasks",
  // dbPath: "./my-evals.db",    // default: ./llmbench.db
  // port: 8080,                 // default: 3000

  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
    { type: "anthropic", name: "Claude Sonnet", model: "claude-sonnet-4-6" },
    {
      type: "ollama",
      name: "Llama 3.2",
      model: "llama3.2",
      // baseUrl: "http://localhost:11434",  // default
    },
  ],

  scorers: [
    { id: "exact", name: "Exact Match", type: "exact-match" },
    { id: "contains", name: "Contains", type: "contains" },
    { id: "json", name: "JSON Match", type: "json-match", options: { partial: true } },
    { id: "cosine", name: "Similarity", type: "cosine-similarity" },
  ],

  defaults: {
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },

  gate: {
    minScore: 0.8,
    maxFailureRate: 0.1,
    maxCost: 5.00,
    maxLatencyMs: 10000,
    scorerThresholds: {
      "exact": 0.9,
    },
  },

  cache: {
    enabled: true,
    ttlHours: 24,
  },
};

export default config;
```

### YAML Config

```yaml
projectName: my-eval-project
description: Comparing GPT-4o vs Claude Sonnet

providers:
  - type: openai
    name: GPT-4o
    model: gpt-4o
  - type: anthropic
    name: Claude Sonnet
    model: claude-sonnet-4-6
  - type: ollama
    name: Llama 3.2
    model: llama3.2

scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
  - id: contains
    name: Contains
    type: contains

defaults:
  concurrency: 5
  maxRetries: 3
  timeoutMs: 30000

gate:
  minScore: 0.8
  maxFailureRate: 0.1

cache:
  enabled: true
  ttlHours: 24
```

### Config Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `projectName` | `string` | Yes | -- | Project identifier |
| `description` | `string` | No | -- | Project description |
| `dbPath` | `string` | No | `./llmbench.db` | SQLite database path |
| `port` | `number` | No | `3000` | Web dashboard port |
| `providers` | `ProviderConfig[]` | Yes | -- | At least one provider |
| `scorers` | `ScorerConfig[]` | Yes | -- | At least one scorer |
| `defaults.concurrency` | `number` | No | `5` | Parallel evaluations |
| `defaults.maxRetries` | `number` | No | `3` | Retry on transient errors |
| `defaults.timeoutMs` | `number` | No | `30000` | Per-request timeout |
| `gate.minScore` | `number` | No | -- | Minimum average score (0-1) |
| `gate.maxFailureRate` | `number` | No | -- | Maximum failure rate (0-1) |
| `gate.maxCost` | `number` | No | -- | Maximum total cost (USD) |
| `gate.maxLatencyMs` | `number` | No | -- | Maximum average latency (ms) |
| `gate.scorerThresholds` | `Record<string, number>` | No | -- | Per-scorer minimum scores |
| `cache.enabled` | `boolean` | No | `true` | Enable response caching |
| `cache.ttlHours` | `number` | No | -- | Cache entry TTL in hours |

## Dataset Format

Datasets can be JSON or YAML. Both support the same fields.

### JSON Dataset

```json
{
  "name": "QA Dataset",
  "testCases": [
    {
      "input": "What is the capital of France?",
      "expected": "Paris"
    },
    {
      "input": "What is 2 + 2?",
      "expected": "4",
      "assert": [
        { "type": "exact-match", "value": "4" },
        { "type": "contains", "value": "4" }
      ]
    },
    {
      "input": "Translate {{text}} to {{language}}",
      "expected": "Bonjour",
      "context": { "text": "Hello", "language": "French" }
    }
  ]
}
```

### YAML Dataset

```yaml
name: QA Dataset
testCases:
  - input: "What is the capital of France?"
    expected: "Paris"

  - input: "What is 2 + 2?"
    expected: "4"
    assert:
      - type: exact-match
        value: "4"
      - type: contains
        value: "4"

  - input: "Name a primary color."
    assert:
      - type: regex
        value: "(red|blue|yellow)"
        options:
          flags: "i"
```

### Test Case Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `input` | `string` | Yes | Prompt sent to the LLM |
| `expected` | `string` | Yes* | Expected output for global scorers. *Optional if `assert` is provided. |
| `assert` | `TestCaseAssertion[]` | No | Per-test-case assertions (override global scorers for this case) |
| `messages` | `ChatMessage[]` | No | Multi-turn conversation: `[{ role: "user", content: "..." }]` |
| `context` | `object` | No | Variables for `{{template}}` interpolation in input and system messages |
| `tags` | `string[]` | No | Tags for filtering and grouping |

### Assertion Format

Each assertion specifies a scorer type and its own expected value:

```yaml
assert:
  - type: contains           # Scorer type
    value: "Paris"            # Expected value for this assertion
    weight: 2.0               # Optional weight
    options:                   # Optional scorer-specific options
      caseSensitive: true
```

Supported inline types: `exact-match`, `contains`, `regex`, `json-match`, `cosine-similarity`, `custom`. Types `llm-judge` and `composite` require global scorer configuration.

## Providers

| Provider | Config `type` | Environment Variable | Example Models |
|----------|--------------|---------------------|--------|
| OpenAI | `openai` | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini, gpt-5, o3, o4-mini |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` | claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001 |
| Google AI | `google` | `GOOGLE_AI_API_KEY` | gemini-2.5-pro, gemini-2.0-flash, gemini-1.5-pro |
| Ollama | `ollama` | None (local) | Any model pulled locally |
| Custom | `custom` | User-defined | Bring your own |

All providers support optional overrides: `temperature`, `maxTokens`, `topP`, `frequencyPenalty`, `presencePenalty`, `stopSequences`, `timeoutMs`, `baseUrl`, `systemMessage`.

API keys are read from environment variables only. They are never stored in the database or config files.

## Scorers

| Scorer | Config `type` | Score Range | Description |
|--------|--------------|-------------|-------------|
| Exact Match | `exact-match` | 0 or 1 | Binary match (case-insensitive, trimmed by default) |
| Contains | `contains` | 0 or 1 | Checks if output contains the expected text |
| Regex | `regex` | 0 or 1 | Tests expected as a regex pattern against the output |
| JSON Match | `json-match` | 0 or 1 | Deep JSON comparison; supports `{ partial: true }` for subset matching |
| Cosine Similarity | `cosine-similarity` | 0.0-1.0 | Token-frequency vector similarity |
| LLM Judge | `llm-judge` | 0.0-1.0 | Uses an LLM to evaluate output against a custom rubric |
| Weighted Composite | `composite` | 0.0-1.0 | Combine multiple scorers with custom weights |

## Export Formats

All commands that produce results support `-o, --output <file>`. The format is auto-detected from the file extension:

| Extension | Format | Description |
|-----------|--------|-------------|
| `.json` | JSON | Machine-readable structured output |
| `.csv` | CSV | Spreadsheet-compatible with scorer columns |
| `.html` | HTML | Self-contained styled report (no external dependencies) |

The `--json` flag outputs structured JSON to stdout for CI pipeline consumption.

## Cost Tracking

Built-in pricing for 50+ models. Cost is calculated automatically per request:

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|----------------------|
| gpt-4o | $2.50 | $10.00 |
| gpt-4o-mini | $0.15 | $0.60 |
| claude-sonnet-4-6 | $3.00 | $15.00 |
| claude-haiku-4-5 | $0.80 | $4.00 |
| gemini-2.0-flash | $0.10 | $0.40 |

Unknown models (including Ollama) report $0 with a warning.

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
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, scorers, and SDK |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library for the dashboard |

## Documentation

Full documentation, architecture details, and contributing instructions at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
