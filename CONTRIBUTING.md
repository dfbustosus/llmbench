# Contributing to LLMBench

Thank you for your interest in contributing to LLMBench! This guide will help you get started.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## Getting Started

### Prerequisites

- **Node.js** >= 20 (see `.nvmrc`)
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Git**

### Setup

```bash
git clone https://github.com/llmbench/llmbench.git
cd llmbench
pnpm install
pnpm build
pnpm test
```

### Project Structure

```
packages/
  types/     Pure TypeScript interfaces
  db/        Database layer (Drizzle + SQLite)
  core/      Evaluation engine
  ui/        UI component library
apps/
  cli/       CLI tool
  web/       Web dashboard
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout -b feat/your-feature
# or
git checkout -b fix/your-bugfix
```

### 2. Make Your Changes

- Follow existing code patterns and conventions
- Write tests for new functionality
- Update types in `@llmbench/types` first if modifying interfaces

### 3. Run Quality Checks

```bash
# Type check and build
pnpm build

# Run tests
pnpm test

# Lint and format
pnpm lint:fix
```

### 4. Submit a Pull Request

- Write a clear title and description
- Reference any related issues
- Ensure CI passes

## Coding Standards

### TypeScript

- **Strict mode** is enabled across all packages
- Use explicit return types on public API functions
- Prefer `interface` over `type` for object shapes
- Use `unknown` over `any` wherever possible
- Validate at system boundaries (user input, API responses, config loading)

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `eval-run-repository.ts` |
| Classes | PascalCase | `EvaluationEngine` |
| Interfaces | PascalCase with `I` prefix for contracts | `IProvider`, `IScorer` |
| Functions | camelCase | `createProvider()` |
| Constants | UPPER_SNAKE_CASE | `PRICING_TABLE` |
| DB columns | snake_case | `created_at` |
| TS properties | camelCase | `createdAt` |

### Error Handling

- Validate inputs at boundaries (CLI args, API params, config files)
- Use typed errors with descriptive messages
- Never silently swallow errors
- Wrap external calls (fetch, file I/O) in try/catch with specific error context

### Testing

- Write tests in `src/__tests__/` directories
- Use in-memory SQLite for database tests
- Mock external services (LLM APIs) in tests
- Test edge cases: empty inputs, invalid data, error paths

### Git Commits

- Use [conventional commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`
- Keep commits focused and atomic
- Write descriptive commit messages

## Adding a New Provider

1. Create `packages/core/src/providers/your-provider.ts` extending `BaseProvider`
2. Implement the `generate()` method
3. Add the provider type to `ProviderType` in `packages/types/src/provider.ts`
4. Register it in `packages/core/src/providers/index.ts` `createProvider()` factory
5. Add pricing data to `packages/core/src/cost/pricing-table.ts`
6. Write tests in `packages/core/src/__tests__/`

## Adding a New Scorer

1. Create your scorer implementing `IScorer` from `@llmbench/types`
2. Place it in the appropriate directory under `packages/core/src/scorers/`
3. Add the scorer type to `ScorerType` in `packages/types/src/scoring.ts`
4. Register it in `packages/core/src/scorers/index.ts`
5. Add CLI support in `apps/cli/src/commands/run.ts` scorer factory
6. Write tests

## Reporting Issues

- Use GitHub Issues
- Include: Node.js version, OS, steps to reproduce, expected vs actual behavior
- For security vulnerabilities, email the maintainers directly instead of creating a public issue

## License

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
