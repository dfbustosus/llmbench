<div align="center">

# LLMBench

**Evaluate, compare, and benchmark LLMs from your terminal.**

Zero-config setup. TypeScript-first. Local-first SQLite. Built-in web dashboard.

[![CI](https://github.com/dfbustosus/llmbench/actions/workflows/ci.yml/badge.svg)](https://github.com/dfbustosus/llmbench/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@llmbench/cli.svg)](https://www.npmjs.com/package/@llmbench/cli)
[![npm downloads](https://img.shields.io/npm/dm/@llmbench/cli.svg)](https://www.npmjs.com/package/@llmbench/cli)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org)

</div>

---

## Quick Start

```bash
npx @llmbench/cli init
export OPENAI_API_KEY=sk-...
npx @llmbench/cli run -d datasets/example.json
npx @llmbench/cli serve
```

That's it. Four commands to go from zero to a full evaluation with a web dashboard at `http://localhost:3000`.

## Features

- **Multi-provider** — Run the same prompts against OpenAI, Anthropic, Google AI, Ollama, or any custom provider. Compare side-by-side.
- **Scoring engine** — Exact match, contains, regex, JSON deep compare, cosine similarity, LLM-as-judge, or compose your own weighted scorer.
- **Regression detection** — Compare any two runs to catch score regressions, cost increases, and latency changes.
- **Cost tracking** — Per-request token counts and cost breakdowns with built-in pricing tables.
- **Web dashboard** — Next.js 15 app with charts, drill-down results, and run comparisons. Launches with `llmbench serve`.
- **Local-first** — Everything stored in a single SQLite file. No cloud accounts, no external services, no data leaving your machine.
- **TypeScript or YAML config** — Use `llmbench.config.ts` with full type safety, or `llmbench.config.yaml` for zero-build setup.
- **Per-test-case assertions** — Override global scorers on individual test cases with inline `assert` rules — like Promptfoo.
- **Quick eval mode** — `llmbench eval "prompt" -p openai:gpt-4o` — test a single prompt without creating dataset files.
- **Export & reporting** — Export results to JSON, CSV, or HTML. Use `--json` for CI artifacts.
- **CI gates** — Set score thresholds and failure rate limits. Exit code 1 on violations for pipeline integration.
- **Response caching** — Avoid duplicate API calls across re-runs. SHA-256 keyed, with optional TTL.

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

## Configuration

Create `llmbench.config.ts` in your project root (or run `llmbench init`):

```typescript
import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
  projectName: "my-eval-project",

  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
    { type: "anthropic", name: "Claude Sonnet", model: "claude-sonnet-4-6" },
    { type: "ollama", name: "Llama 3.2", model: "llama3.2" },
  ],

  scorers: [
    { id: "exact-match", name: "Exact Match", type: "exact-match" },
    { id: "contains", name: "Contains", type: "contains" },
    { id: "cosine", name: "Similarity", type: "cosine-similarity" },
  ],

  defaults: {
    concurrency: 5,
    maxRetries: 3,
    timeoutMs: 30000,
  },
};

export default config;
```

## Datasets

Create a JSON file with your test cases:

```json
{
  "name": "QA Dataset",
  "testCases": [
    { "input": "What is the capital of France?", "expected": "Paris" },
    { "input": "What is 2 + 2?", "expected": "4" }
  ]
}
```

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
| `llmbench serve -p 8080` | Launch dashboard on custom port |

## Providers

| Provider | Config type | Environment Variable |
|----------|-------------|---------------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google AI | `google` | `GOOGLE_AI_API_KEY` |
| Ollama | `ollama` | None (local) |
| Custom | `custom` | User-defined |

API keys are read from environment variables only. They are never stored in the database or config files.

## Scorers

| Scorer | Config type | Description |
|--------|-------------|-------------|
| Exact Match | `exact-match` | Binary match with optional case/trim normalization |
| Contains | `contains` | Checks if output contains the expected text |
| Regex | `regex` | Pattern matching with configurable flags |
| JSON Match | `json-match` | Deep JSON comparison with partial matching support |
| Cosine Similarity | `cosine-similarity` | Token-based vector similarity (0-1) |
| LLM Judge | `llm-judge` | Use an LLM to evaluate outputs against a custom rubric |
| Weighted Average | `composite` | Combine multiple scorers with custom weights |

## How It Compares

| Feature | LLMBench | Promptfoo | LangSmith | Braintrust |
|---------|---------|-----------|-----------|------------|
| Zero-config setup | Yes | Partial | No | No |
| Web dashboard | Yes | No | Yes | Yes |
| Local-first | Yes | Yes | No | No |
| TypeScript config | Yes | YAML | Python | Python |
| Open source | Yes | Yes | No | Partial |
| Self-hosted | Yes | Yes | No | No |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture details, and guidelines for adding new providers or scorers.

```bash
git clone https://github.com/dfbustosus/llmbench.git
cd llmbench
pnpm install
pnpm build
pnpm test
```

## License

[Apache License 2.0](LICENSE)
