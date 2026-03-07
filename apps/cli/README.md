# LLMBench

**Evaluate, compare, and benchmark LLMs from your terminal.**

```bash
npx @llmbench/cli init
export OPENAI_API_KEY=sk-...
npx @llmbench/cli run -d datasets/example.json
npx @llmbench/cli serve
```

## Features

- **Multi-provider** — OpenAI, Anthropic, Google AI, Ollama, or custom providers
- **Scoring engine** — Exact match, contains, regex, JSON deep compare, cosine similarity, LLM-as-judge
- **Regression detection** — Compare runs to catch score regressions, cost increases, latency changes
- **Cost tracking** — Per-request token counts and cost breakdowns
- **Web dashboard** — Charts, drill-down results, run comparisons at `localhost:3000`
- **Local-first** — Single SQLite file, no cloud, no data leaving your machine
- **TypeScript config** — Full type safety and autocompletion

## CLI Reference

| Command | Description |
|---------|-------------|
| `llmbench init` | Scaffold config file and example dataset |
| `llmbench run -d <dataset>` | Run evaluation against a dataset |
| `llmbench list` | List all evaluation runs |
| `llmbench compare <runA> <runB>` | Compare two runs with regression detection |
| `llmbench serve` | Launch web dashboard |

## Requirements

Node.js >= 20

## Documentation

Full documentation, configuration guide, and contributing instructions at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
