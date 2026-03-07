<div align="center">

# @llmbench/ui

**UI component library for the LLMBench web dashboard.**

[![npm version](https://img.shields.io/npm/v/@llmbench/ui.svg)](https://www.npmjs.com/package/@llmbench/ui)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

This package provides the shared React components used by the LLMBench web dashboard. Built with Tailwind CSS and class-variance-authority (CVA) for variant-based styling.

## Installation

```bash
npm install @llmbench/ui
```

## Usage

```typescript
import { Button, Card, Badge } from "@llmbench/ui";
import "@llmbench/ui/globals.css";
```

## Peer Dependencies

- `react` >= 19.0.0

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool (includes `llmbench serve` to launch the dashboard) |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |

## Documentation

Full documentation at **[github.com/dfbustosus/llmbench](https://github.com/dfbustosus/llmbench)**.

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
