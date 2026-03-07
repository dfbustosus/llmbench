<p align="center">
  <h1 align="center">LLMBench</h1>
  <p align="center">
    <strong>The open-source LLM benchmarking and evaluation platform.</strong>
  </p>
  <p align="center">
    Zero-config setup. Beautiful dashboard. TypeScript-first. Local-first.
  </p>
</p>

<p align="center">
  <a href="https://github.com/llmbench/llmbench/actions/workflows/ci.yml"><img src="https://github.com/llmbench/llmbench/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://www.npmjs.com/package/llmbench"><img src="https://img.shields.io/npm/v/llmbench.svg" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/llmbench"><img src="https://img.shields.io/npm/dm/llmbench.svg" alt="npm downloads"></a>
  <a href="https://github.com/llmbench/llmbench/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="License"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-strict-blue.svg" alt="TypeScript"></a>
</p>

---

## Why LLMBench?

Existing LLM evaluation tools are either too academic, too enterprise, or too CLI-only. LLMBench combines **radical simplicity**, a **beautiful web dashboard**, **local-first SQLite storage**, and **TypeScript-first configuration** in a single `npx llmbench` experience.

| Feature | LLMBench | Promptfoo | LangSmith | Braintrust |
|---------|---------|-----------|-----------|------------|
| Zero-config setup | Yes | Partial | No | No |
| Web dashboard | Yes | No | Yes | Yes |
| Local-first | Yes | Yes | No | No |
| TypeScript config | Yes | YAML | Python | Python |
| Open source | Yes | Yes | No | Partial |
| Self-hosted | Yes | Yes | No | No |

## Quick Start

```bash
# Initialize a new project
npx llmbench init

# Set your API key
export OPENAI_API_KEY=sk-...

# Run your first evaluation
npx llmbench run --dataset datasets/example.json

# View results in the dashboard
npx llmbench serve
```

## Installation

```bash
# As a project dependency
pnpm add llmbench

# Or globally
pnpm add -g llmbench
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

Create JSON datasets in your project:

```json
{
  "name": "QA Dataset",
  "testCases": [
    { "input": "What is the capital of France?", "expected": "Paris" },
    { "input": "What is 2 + 2?", "expected": "4" }
  ]
}
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `llmbench init` | Scaffold a new project with config and example dataset |
| `llmbench run -d <dataset>` | Run an evaluation against a dataset |
| `llmbench list` | List all evaluation runs |
| `llmbench compare <runA> <runB>` | Compare two runs side-by-side with regression detection |
| `llmbench serve` | Launch the web dashboard |

## Providers

LLMBench supports multiple LLM providers out of the box:

| Provider | Type | Env Variable |
|----------|------|-------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google AI | `google` | `GOOGLE_AI_API_KEY` |
| Ollama | `ollama` | (local, no key needed) |
| Custom | `custom` | (user-defined) |

## Scorers

### Deterministic Scorers
- **Exact Match** - Binary match with case/trim options
- **Contains** - Checks if output contains expected text
- **Regex** - Pattern matching with configurable flags
- **JSON Match** - Deep JSON comparison with partial matching

### Semantic Scorers
- **Cosine Similarity** - Token-based vector similarity (0-1)

### AI Scorers
- **LLM Judge** - Use an LLM to evaluate outputs with custom rubrics

### Composite Scorers
- **Weighted Average** - Combine multiple scorers with custom weights

## Architecture

```
llmbench/
  packages/
    types/     Pure TypeScript interfaces (zero deps)
    db/        Drizzle ORM + SQLite (WAL mode)
    core/      Evaluation engine, providers, scorers
    ui/        shadcn/ui component library
  apps/
    cli/       Commander-based CLI tool
    web/       Next.js 15 dashboard with tRPC
```

### Package Dependency Graph

```
@llmbench/types  (leaf - zero dependencies)
       |
@llmbench/db     (depends on: types)
       |
@llmbench/core   (depends on: types, db)
       |
apps/cli        (depends on: types, db, core)
apps/web        (depends on: types, db, core, ui)

@llmbench/ui     (leaf - pure React components)
```

## Development

```bash
# Clone and install
git clone https://github.com/llmbench/llmbench.git
cd llmbench
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint
pnpm lint:fix

# Dev mode (watch)
pnpm dev
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo + pnpm |
| Language | TypeScript (strict mode) |
| Frontend | Next.js 15 (App Router) |
| UI Components | shadcn/ui + Radix + Tailwind v4 |
| API | tRPC v11 |
| Database | SQLite + Drizzle ORM |
| Charts | Recharts |
| CLI | Commander + ora + chalk |
| Testing | Vitest |
| Linting | Biome |

## API Keys

API keys are read exclusively from environment variables. They are **never** stored in the database or config files.

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GOOGLE_AI_API_KEY=AI...
```

## License

[Apache License 2.0](LICENSE)
