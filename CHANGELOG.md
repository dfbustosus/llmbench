# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-03-21

### Added

- UNIQUE constraint on `providers(project_id, name)` — prevents duplicate provider names per project
- UNIQUE constraint on `datasets(project_id, name, version)` — prevents duplicate dataset versions
- Schema migration V2 with deduplication of pre-existing duplicate rows
- `columnExists()` helper for safe schema introspection during migrations
- `ProviderRepository.findByProjectAndName()` — efficient O(1) lookup leveraging unique index
- `ProviderRepository.update()` — update provider type, model, or config after creation
- Pagination (`limit`/`offset`) on `CostRecordRepository.findByRunId()` and `ScoreRepository.findByRunId()`
- `DEFAULT_LIMITS` and `BATCH_CHUNK_SIZE` shared constants — single source of truth for pagination defaults
- Dependabot configuration for automated dependency updates
- CODE_OF_CONDUCT.md (Contributor Covenant v2.1)
- GitHub issue templates (bug report, feature request) and PR template
- `apps/web/README.md` with architecture, tech stack, and development setup

### Fixed

- Migration system no longer swallows real errors — replaced `try/catch ALTER TABLE` with `columnExists()` checks
- `TestCaseRepository.createMany()` and `ScoreRepository.createMany()` now wrapped in transactions for atomicity across chunks
- SDK `evaluate()` now uses find-or-create for providers — prevents unique constraint crash on repeated calls
- Provider lookup in CLI commands uses `findByProjectAndName()` — O(1) indexed query instead of fetch-all + filter
- Dataset creation in `eval` command and web dashboard uses auto-versioning to prevent constraint violations
- Pagination defaults extracted from magic numbers to named `DEFAULT_LIMITS` constants (DRY)
- `@llmbench/db` README rewritten — fixed 31 inaccuracies including wrong method names, missing methods, incorrect API signatures, and undocumented pagination
- `apps/cli/README.md` — fixed scorer count (7 → 12), added 4 missing providers, fixed Claude Haiku pricing
- All documentation updated to reflect correct 1.0.0 versioning (was 0.1.x)
- Removed phantom "openai-compatible" provider type from docs (it's a base class, not a standalone type)

### Changed

- Schema version bumped to 2
- CI security audit now fails on critical/high advisories (previously `continue-on-error`)

## [1.0.0] - 2026-03-15

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
- CI gate system with threshold-based pass/fail for `run` and `compare` commands
- Per-provider score breakdown in the web dashboard
- Batch score fetching via `ScoreRepository.findByRunId()`
- Prompt template engine with variable interpolation
- Multi-turn conversation support (`ChatMessage[]`) for all providers
- Graceful cancellation with `AbortSignal` support
- Run comparison with regression detection (`llmbench compare`)
- Cost tracking and pricing table for major LLM providers
- Web dashboard with project, dataset, and run views
- Multi-provider evaluation support
- 12 built-in scorers across deterministic, semantic, LLM-judge, and composite categories
- 9 provider integrations: OpenAI, Anthropic, Google AI, Mistral, Together AI, AWS Bedrock, Azure OpenAI, Ollama, custom
- CLI with `init`, `run`, `eval`, `list`, `compare`, and `serve` commands
- SQLite storage with repository pattern and WAL mode
- SECURITY.md, CONTRIBUTING.md, CHANGELOG.md
- Comprehensive READMEs for all packages
- npm provenance attestation in release pipeline
