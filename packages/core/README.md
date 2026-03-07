<div align="center">

# @llmbench/core

**Evaluation engine, providers, and scorers for the LLMBench platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/core.svg)](https://www.npmjs.com/package/@llmbench/core)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This package contains the core evaluation engine that powers LLMBench — including LLM provider integrations, scoring functions, cost tracking, and run comparison.

## Installation

```bash
npm install @llmbench/core
```

## Exports

| Export | Description |
|--------|-------------|
| `@llmbench/core` | Main entry point |
| `@llmbench/core/providers` | LLM provider implementations (OpenAI, Anthropic, Google AI, Ollama) |
| `@llmbench/core/scorers` | Scoring functions (exact match, contains, regex, JSON match, cosine similarity, LLM judge) |
| `@llmbench/core/engine` | Evaluation runner engine |
| `@llmbench/core/cost` | Token counting and cost calculation |
| `@llmbench/core/comparison` | Run comparison and regression detection |
| `@llmbench/core/config` | Configuration loader |

## Providers

| Provider | Description |
|----------|-------------|
| `OpenAIProvider` | OpenAI API (GPT-4o, GPT-4, etc.) |
| `AnthropicProvider` | Anthropic API (Claude Sonnet, Opus, Haiku) |
| `GoogleProvider` | Google AI API (Gemini) |
| `OllamaProvider` | Local Ollama models (Llama, Mistral, etc.) |

## Scorers

| Scorer | Description |
|--------|-------------|
| `exact-match` | Binary match with optional case/trim normalization |
| `contains` | Checks if output contains the expected text |
| `regex` | Pattern matching with configurable flags |
| `json-match` | Deep JSON comparison with partial matching |
| `cosine-similarity` | Token-based vector similarity (0–1) |
| `llm-judge` | Use an LLM to evaluate outputs against a rubric |
| `composite` | Combine multiple scorers with custom weights |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |

## Documentation

Full documentation at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
