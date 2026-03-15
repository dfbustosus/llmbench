# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.5] - 2026-03-15

### Added

- YAML config support — `llmbench.config.yaml` and `.yml` alongside TypeScript/JavaScript configs
- YAML dataset support — `--dataset` flag now accepts `.yaml` and `.yml` files
- Per-test-case assertions — `assert` field on test cases overrides global scorers with inline rules
- `TestCaseAssertion` type with `type`, `value`, `weight`, and `options` fields
- Dataset loader (`loadDataset()`) for JSON and YAML with full assertion validation
- `--format yaml` option for `llmbench init` — generates YAML config + dataset with assertion examples
- `llmbench eval` command — quick inline evaluation without dataset files
  - Provider shorthand: `-p openai:gpt-4o`
  - Expected output scoring: `-e "expected" -s exact-match`
  - System message, temperature, max-tokens controls
  - Stdin piping support
  - `--no-save` fast path (skip DB)
- Export system — `-o` flag on `run`, `eval`, and `compare` commands
  - JSON export with full result metadata
  - CSV export with scorer columns and summary sections
  - HTML export with self-contained styled reports
- `--json` flag for CI pipeline output on `run`, `eval`, and `compare`
- `--no-cache` and `--clear-cache` flags for `run` command
- `--threshold` and `--max-failure-rate` CI gate flags for `run` command
- `--fail-on-regression` and `--min-severity` flags for `compare` command
- SDK functions: `evaluate()` and `evaluateQuick()` for programmatic usage
- Response caching with SHA-256 keys and optional TTL expiry
- Dataset versioning with content hash tracking
- `assert` column migration for existing databases

### Changed

- Config loader now searches `.yaml` and `.yml` in addition to `.ts`, `.js`, `.mjs`
- `run` command dataset validation moved to shared `loadDataset()` in `@llmbench/core`
- `EvaluationEngine` pre-creates scorers from assertions before provider calls (fail-fast)
- Content hash computation includes `assert` field for dataset versioning
- Updated documentation across all packages

## [0.1.4] - 2026-03-08

### Added

- CI gate system with threshold-based pass/fail for `run` and `compare` commands
- `--threshold`, `--max-failure-rate`, and `--json` flags for `llmbench run`
- `--fail-on-regression`, `--min-severity`, and `--json` flags for `llmbench compare`
- Per-provider score breakdown in the web dashboard
- Provider column in run detail results table (shown for multi-provider runs)
- Score columns with color-coded values (green/yellow/red) in results table
- Batch score fetching via `ScoreRepository.findByRunId()`
- `getScoresByRunId` and `getProvidersByProject` tRPC endpoints
- Latency chart shows provider names in multi-provider runs
- Prompt template engine with variable interpolation
- `messages` and `context` fields in test case datasets
- Multi-turn conversation support (`ChatMessage[]`) for all providers
- System message support in `BaseProvider`
- SECURITY.md with vulnerability reporting policy
- CHANGELOG.md
- `bugs` and `homepage` fields in all publishable package.json files
- tRPC error logging in API route handler

### Fixed

- Score distribution chart now uses actual scorer data instead of error-based fallback
- Web dashboard 500 errors caused by better-sqlite3 native bindings in webpack (externalized)
- DB singleton persistence across Next.js HMR reloads via `globalThis`
- Gate config validation in config loader

## [0.1.3] - 2026-03-06

### Added

- Comprehensive READMEs with examples for all packages
- npm publish metadata for all packages

## [0.1.2] - 2026-02-15

### Added

- Run comparison with regression detection (`llmbench compare`)
- Cost tracking and pricing table for major LLM providers
- Web dashboard with project, dataset, and run views

## [0.1.1] - 2026-01-20

### Added

- Multi-provider evaluation support
- Configurable scorers (exact-match, contains, levenshtein, llm-judge)
- SQLite storage with repository pattern

## [0.1.0] - 2026-01-05

### Added

- Initial release
- CLI with `init`, `run`, `list`, and `serve` commands
- OpenAI and Anthropic provider support
- Basic evaluation engine with concurrency control
