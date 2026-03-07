<div align="center">

# @llmbench/db

**SQLite database layer for the LLMBench evaluation platform.**

[![npm version](https://img.shields.io/npm/v/@llmbench/db.svg)](https://www.npmjs.com/package/@llmbench/db)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This package provides the persistence layer for LLMBench. It uses SQLite (via `better-sqlite3`) with Drizzle ORM for type-safe queries. All evaluation runs, results, and metadata are stored locally in a single `.db` file.

## Installation

```bash
npm install @llmbench/db
```

## Features

- **Single-file storage** — Everything in one SQLite file, easy to back up or share
- **Drizzle ORM** — Type-safe schema and queries
- **Auto-migration** — Schema is created automatically on first use
- **Zero config** — Works out of the box with sensible defaults

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool for running evaluations |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |

## Documentation

Full documentation at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
