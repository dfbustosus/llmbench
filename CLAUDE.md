# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LLMBench is an open-source LLM benchmarking and evaluation platform. It's a TypeScript monorepo that provides a CLI for running evaluations against LLM providers, scoring outputs, and viewing results in a web dashboard. Data is stored locally in SQLite.

## Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages (via Turborepo, respects dependency order)
pnpm test             # Run all tests (via Turborepo, requires build first)
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
- **`@llmbench/db`** — Drizzle ORM + better-sqlite3. Schema in `src/schema/index.ts`, repository pattern in `src/repositories/`. Uses WAL mode. Tests use in-memory SQLite.
- **`@llmbench/core`** — Evaluation engine, LLM providers, scorers, cost calculator, config loader. Key entry points: `createProvider()` factory, `createScorer()` factory, `EvaluationEngine` class.
- **`@llmbench/ui`** — React component library (shadcn/ui + CVA + tailwind-merge). Peer dep on React 19.
- **`apps/cli`** (`llmbench`) — Commander-based CLI. Commands: `init`, `run`, `list`, `compare`, `serve`.
- **`apps/web`** — Next.js 15 (App Router) dashboard with tRPC v11 API. tRPC routers in `src/trpc/routers/`.

### Key Patterns

- **Provider pattern**: Extend `BaseProvider` in `packages/core/src/providers/`, implement `generate()`. Register in `createProvider()` factory. Add pricing to `cost/pricing-table.ts`.
- **Scorer pattern**: Implement `IScorer` interface, place in `packages/core/src/scorers/{category}/`. Register in `createScorer()` factory.
- **Engine**: `EvaluationEngine` orchestrates runs with concurrency control (`ConcurrencyManager`), retries (`RetryHandler`), and event emission (`EventBus`).
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

## Node Version

Node.js >= 20 (see `.nvmrc`)
