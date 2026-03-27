# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLMBench is an open-source LLM benchmarking and evaluation platform. It's a TypeScript monorepo that provides a CLI for running evaluations against LLM providers, scoring outputs, and viewing results in a web dashboard. Data is stored locally in SQLite.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (via Turborepo, respects dependency order)
pnpm test             # Run all tests (via Turborepo; `build` runs automatically as a dependency)
pnpm lint             # Lint with Biome
pnpm lint:fix         # Lint and auto-fix with Biome
pnpm dev              # Dev mode with watch (all packages)
pnpm clean            # Clean all dist/.next outputs
```

Run a single package's tests:
```bash
cd packages/core && pnpm test    # or: npx vitest run --project core
cd packages/db && pnpm test
```

Run a single test file:
```bash
npx vitest run packages/core/src/__tests__/scorers.test.ts
```

## Architecture

**Monorepo**: Turborepo + pnpm workspaces. Packages in `packages/*`, apps in `apps/*`.

**Dependency graph** (types is the leaf, everything flows up):
```
@llmbench/types  →  @llmbench/db  →  @llmbench/core  →  apps/cli (llmbench)
                                                      →  apps/web (@llmbench/web)
@llmbench/ui (standalone, peer: react)  →  apps/web
```

### Packages

- **`@llmbench/types`** — Pure TypeScript interfaces/types, zero runtime deps. All shared contracts (`IProvider`, `IScorer`, `LLMBenchConfig`, `EvalRun`, etc.) live here. Modify types here first when changing interfaces.
- **`@llmbench/db`** — Drizzle ORM + better-sqlite3. Schema in `src/schema/index.ts`, repository pattern in `src/repositories/`. Uses WAL mode. Tests use in-memory SQLite. All IDs are text (string-based, not UUID). Repositories: Project, Dataset, TestCase, EvalRun, EvalResult, Score, CostRecord, Provider, Cache. **Migrations**: Embedded versioned migrations in `src/client.ts` (SCHEMA_VERSION = 4), not Drizzle CLI — each version has a `migrateToVN()` function with backward-compatible ALTER TABLE statements.
- **`@llmbench/core`** — Evaluation engine, LLM providers, scorers, cost calculator, config loader. Key entry points: `createProvider()` factory, `createScorer()` factory, `EvaluationEngine` class.
- **`@llmbench/ui`** — React component library (shadcn/ui + CVA + tailwind-merge). Peer dep on React 19.
- **`apps/cli`** (`llmbench`) — Commander-based CLI. Commands: `init`, `run`, `list`, `compare`, `serve`.
- **`apps/web`** — Next.js 15 (App Router) dashboard with tRPC v11 API. tRPC routers in `src/trpc/routers/` (project, dataset, eval-run, comparison). Uses SuperJSON serialization and Zod validation. Webpack config externalizes `better-sqlite3` on the server side. DB and repository singletons are cached on `globalThis` to survive HMR in dev. Path alias: `@/*` → `./src/*`.

### Key Patterns

- **Provider pattern**: Extend `BaseProvider` in `packages/core/src/providers/`, implement `generate()`. Register in `createProvider()` factory. Add pricing to `cost/pricing-table.ts`. Current providers (9 types): openai, azure-openai, anthropic, google, mistral, together, bedrock, ollama, custom. `OpenAICompatibleProvider` is the shared base class for openai, azure-openai, together, and mistral.
- **Provider features**: `ProviderConfig` supports `responseFormat` (JSON mode), `tools`/`toolChoice` (function calling), and `stream` (streaming with TTFT measurement). Each provider maps these to its native API format. `ProviderResponse` includes optional `toolCalls` and `timeToFirstTokenMs`.
- **Streaming parsers**: Reusable async generators in `packages/core/src/providers/streaming/`: `parseSSE` (OpenAI/Anthropic/Google), `parseNDJSON` (Ollama), `parseBedrockEventStream` (AWS binary). Providers use these internally when `stream: true` to measure time-to-first-token.
- **Scorer pattern**: Implement `IScorer` interface, place in `packages/core/src/scorers/{category}/`. Register in `createScorer()` factory. Categories: `deterministic/` (exact-match, contains, regex, json-match, json-schema), `semantic/` (cosine-similarity, levenshtein, bleu, rouge, embedding-similarity), `llm-judge/`, `composite/` (weighted-average).
- **Engine**: `EvaluationEngine` orchestrates runs with concurrency control (`ConcurrencyManager`), retries (`RetryHandler`), event emission (`EventBus`), prompt interpolation (`TemplateEngine`), and response caching (`CacheManager` — SHA-256 keyed with optional TTL). All in `packages/core/src/engine/`.
- **Template engine**: `interpolate()` and `interpolateMessages()` substitute `{{variable}}` placeholders in prompts using test case context. Supports both string prompts and `ChatMessage[]` multi-turn inputs.
- **Subpath exports**: `@llmbench/core` exposes subpaths: `./providers`, `./scorers`, `./engine`, `./cost`, `./comparison`, `./gate`, `./config`, `./sdk`.
- **All packages are ESM** (`"type": "module"`). Use `.js` extensions in imports even for TypeScript files.

## Code Style

- **Biome** for linting and formatting (not ESLint/Prettier)
- Tabs for indentation, line width 100, double quotes, semicolons always
- Files: kebab-case. Classes: PascalCase. Interfaces: PascalCase with `I` prefix for contracts.
- Constants: UPPER_SNAKE_CASE. DB columns: snake_case. TS properties: camelCase.
- TypeScript strict mode enabled across all packages
- Prefer `interface` over `type` for object shapes; use `unknown` over `any`
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`

## Testing

- Vitest with workspace config (`vitest.workspace.ts`)
- Tests go in `src/__tests__/` directories within each package
- Test globals are enabled (no need to import `describe`, `it`, `expect`)
- DB tests use in-memory SQLite

## CI

- GitHub Actions runs tests on Node 20 and 22 (matrix strategy)
- Security audit job checks for critical/high vulnerabilities
- Release pipeline triggered by `v*` tags, publishes to npm with provenance

## Node Version

Node.js >= 20 (see `.nvmrc`)
