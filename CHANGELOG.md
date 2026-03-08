# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] - 2026-03-08

### Added

- CI gate system with threshold-based pass/fail for `run` and `compare` commands
- `--threshold`, `--max-failure-rate`, and `--json` flags for `llmbench run`
- `--fail-on-regression`, `--min-severity`, and `--json` flags for `llmbench compare`
- Per-provider score breakdown in the web dashboard
- Batch score fetching via `ScoreRepository.findByRunId()`
- Provider column in run detail results table
- Score columns with color-coded values in results table
- Score distribution chart uses actual scorer data
- Latency chart shows provider names in multi-provider runs
- Prompt template engine with variable interpolation
- `messages` and `context` fields in test case datasets
- SECURITY.md with vulnerability reporting policy

### Fixed

- Score distribution chart fallback when no scores are attached to results

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
