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

Or test a single prompt without any files:

```bash
npx @llmbench/cli eval "What is the capital of France?" -p openai:gpt-4o -p anthropic:claude-sonnet-4-6
```

## Features

- **9 providers** — OpenAI, Anthropic, Google AI, Mistral, Together AI, AWS Bedrock, Azure OpenAI, Ollama, or fully custom providers. Compare side-by-side.
- **19 built-in scorers** — Deterministic (exact match, contains, regex, JSON match, JSON schema), semantic (cosine similarity, Levenshtein, BLEU, ROUGE, embedding similarity), RAG (context precision, context recall, faithfulness, answer relevancy), agent (tool call accuracy, trajectory validation, goal completion), LLM-as-judge, and weighted composite.
- **Per-test-case assertions** — Override global scorers on individual test cases with inline `assert` rules. Test different criteria per prompt.
- **Graceful cancellation** — Press Ctrl+C for cooperative cancellation that lets in-flight API calls finish. Double Ctrl+C to force quit. Cancel stuck runs from the web dashboard. Full `AbortSignal` support in the SDK.
- **Quick eval mode** — `llmbench eval "prompt" -p openai:gpt-4o` — test a single prompt ad-hoc without creating files.
- **TypeScript or YAML config** — Use `llmbench.config.ts` with full type safety, or `llmbench.config.yaml` for zero-build setup. Datasets support both JSON and YAML.
- **Export & reporting** — Export any results to JSON, CSV, or self-contained HTML reports. Use `--json` for CI artifacts.
- **CI gates** — Set score thresholds, failure rate limits, cost budgets, and latency caps. Exit code 1 on violations for pipeline integration.
- **Regression detection** — Compare any two runs to catch score regressions, cost increases, and latency changes with severity levels.
- **Response caching** — Avoid duplicate API calls across re-runs. SHA-256 keyed with optional TTL expiry.
- **Cost tracking** — Per-request token counts and cost breakdowns with built-in pricing for 50+ models.
- **Prompt templates** — Use `{{variable}}` interpolation in prompts and system messages with per-test-case context.
- **Dataset versioning** — Content-hashed datasets with automatic version tracking across runs.
- **Programmatic SDK** — One-call `evaluate()` function from `@llmbench/core` for embedding in your own tools.
- **Web dashboard** — Next.js 15 app with real-time progress via SSE, charts, drill-down results, run comparisons, and full CRUD for projects, datasets, and test cases. Launches with `llmbench serve`.
- **Local-first** — Everything stored in a single SQLite file. No cloud accounts, no external services, no data leaving your machine.

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

LLMBench supports both TypeScript and YAML configuration. Run `llmbench init` (TypeScript) or `llmbench init --format yaml` (YAML).

### TypeScript Config

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

  gate: {
    minScore: 0.8,
    maxFailureRate: 0.1,
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

Config file search order: `llmbench.config.ts` > `.js` > `.mjs` > `.yaml` > `.yml`

## Datasets

Datasets can be JSON or YAML. Both formats support per-test-case assertions.

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
| `input` | `string` | Yes | The prompt sent to the LLM |
| `expected` | `string` | Yes* | Expected output for global scorers. *Optional when `assert` is provided. |
| `assert` | `array` | No | Per-test-case assertions (overrides global scorers for this case) |
| `messages` | `ChatMessage[]` | No | Multi-turn conversation messages |
| `context` | `object` | No | Variables for `{{template}}` interpolation |
| `tags` | `string[]` | No | Tags for filtering and grouping |

### Per-Test-Case Assertions

When `assert` is present on a test case, those assertions replace the global scorers for that case. Each assertion specifies its own expected value:

```yaml
assert:
  - type: contains        # Scorer type
    value: "Paris"         # Expected value for this assertion
    weight: 2.0            # Optional weight
    options:               # Optional scorer-specific options
      caseSensitive: true
```

Supported assertion types: `exact-match`, `contains`, `regex`, `json-match`, `cosine-similarity`, `custom`. Types `llm-judge` and `composite` must be defined as global scorers.

## CLI Reference

| Command | Description |
|---------|-------------|
| `llmbench init` | Scaffold config file and example dataset |
| `llmbench run -d <dataset>` | Run evaluation against a dataset |
| `llmbench eval "prompt" -p <provider>` | Quick ad-hoc evaluation |
| `llmbench list` | List all evaluation runs |
| `llmbench compare <runA> <runB>` | Compare two runs with regression detection |
| `llmbench serve` | Launch web dashboard |

### Key Flags

```bash
# Init with YAML instead of TypeScript
llmbench init --format yaml

# Run with CI gates and export
llmbench run -d data.yaml --threshold 0.8 --max-failure-rate 0.1 -o results.html

# Run with caching disabled
llmbench run -d data.yaml --no-cache

# Quick eval against multiple providers
llmbench eval "Explain quantum computing" -p openai:gpt-4o -p anthropic:claude-sonnet-4-6 --json

# Quick eval with scoring
llmbench eval "What is 2+2?" -p openai:gpt-4o -e "4" -s exact-match -s contains

# Compare with regression gating
llmbench compare abc123 def456 --fail-on-regression --min-severity medium

# Export results
llmbench run -d data.json -o results.json   # or .csv or .html
```

## Programmatic SDK

Use `@llmbench/core` directly for embedding evaluations in your code:

```typescript
import { evaluate } from "@llmbench/core";

const result = await evaluate({
  testCases: [
    { input: "What is 2+2?", expected: "4" },
    {
      input: "Capital of France?",
      assert: [{ type: "contains", value: "Paris" }],
    },
  ],
  providers: [
    { type: "openai", name: "GPT-4o", model: "gpt-4o" },
  ],
});

console.log(result.status);          // "completed"
console.log(result.scorerAverages);  // { "exact-match": 1.0 }
```

See [@llmbench/core README](packages/core/README.md) for full SDK documentation.

## Providers

| Provider | Config type | Environment Variable |
|----------|-------------|---------------------|
| OpenAI | `openai` | `OPENAI_API_KEY` |
| Anthropic | `anthropic` | `ANTHROPIC_API_KEY` |
| Google AI | `google` | `GOOGLE_AI_API_KEY` |
| Mistral | `mistral` | `MISTRAL_API_KEY` |
| Together AI | `together` | `TOGETHER_API_KEY` |
| AWS Bedrock | `bedrock` | AWS credentials (env or profile) |
| Azure OpenAI | `azure-openai` | `AZURE_OPENAI_API_KEY` |
| Ollama | `ollama` | None (local) |
| Custom | `custom` | User-defined |

API keys are read from environment variables only. They are never stored in the database or config files.

## Scorers

| Scorer | Config type | Category | Description |
|--------|-------------|----------|-------------|
| Exact Match | `exact-match` | Deterministic | Binary match with optional case/trim normalization |
| Contains | `contains` | Deterministic | Checks if output contains the expected text |
| Regex | `regex` | Deterministic | Pattern matching with configurable flags |
| JSON Match | `json-match` | Deterministic | Deep JSON comparison with partial matching support |
| JSON Schema | `json-schema` | Deterministic | Validates output against a JSON schema |
| Cosine Similarity | `cosine-similarity` | Semantic | Token-based vector similarity (0-1) |
| Levenshtein | `levenshtein` | Semantic | Edit-distance-based similarity (0-1) |
| BLEU | `bleu` | Semantic | Machine translation quality metric |
| ROUGE | `rouge` | Semantic | Recall-oriented summary evaluation |
| Embedding Similarity | `embedding-similarity` | Semantic | Embedding-based semantic similarity |
| Context Precision | `context-precision` | RAG | Ranking quality of retrieved context documents |
| Context Recall | `context-recall` | RAG | Coverage of ground truth by retrieved context |
| Faithfulness | `faithfulness` | RAG | Factual consistency between answer and context (hallucination detection) |
| Answer Relevancy | `answer-relevancy` | RAG | How well the answer addresses the original question |
| Tool Call Accuracy | `tool-call-accuracy` | Agent | Correct function names and arguments vs expected |
| Trajectory Validation | `trajectory-validation` | Agent | Tool call ordering via longest common subsequence |
| Goal Completion | `goal-completion` | Agent | LLM judges whether the agent achieved its goal |
| LLM Judge | `llm-judge` | LLM | Evaluate outputs against a custom rubric |
| Weighted Average | `composite` | Composite | Combine multiple scorers with custom weights |

## How It Compares

| Feature | LLMBench | Promptfoo | LangSmith | Braintrust |
|---------|---------|-----------|-----------|------------|
| Zero-config setup | Yes | Partial | No | No |
| YAML config | Yes | Yes | No | No |
| TypeScript config | Yes | No | No | No |
| Per-test assertions | Yes | Yes | No | No |
| Quick eval mode | Yes | Yes | No | No |
| RAG scorers | Yes | Partial | No | No |
| Agent/tool-use scorers | Yes | Partial | No | No |
| Web dashboard | Yes | No | Yes | Yes |
| Export JSON/CSV/HTML | Yes | JSON only | No | No |
| CI gates | Yes | Yes | No | Partial |
| Local-first | Yes | Yes | No | No |
| Open source | Yes | Yes | No | Partial |

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
