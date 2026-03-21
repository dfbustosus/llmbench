<div align="center">

# @llmbench/web

**Web dashboard for exploring LLMBench evaluation results.**

</div>

---

Next.js 15 (App Router) dashboard with tRPC v11 API for browsing projects, datasets, evaluation runs, and comparisons. Launches via `llmbench serve`.

## Features

- Real-time evaluation progress via Server-Sent Events (SSE)
- Project and dataset management with full CRUD
- Run detail pages with score breakdowns, latency charts, and per-result drill-down
- Multi-provider score comparison with color-coded tables
- Run-to-run comparison with regression detection
- Responsive layout built with `@llmbench/ui` (shadcn/ui + Tailwind CSS)

## Development

```bash
# From monorepo root
pnpm dev          # starts all packages in watch mode

# Or standalone
cd apps/web
pnpm dev          # starts Next.js dev server on port 3000
pnpm build        # production build
pnpm start        # start production server
```

## Architecture

```
src/
  app/                          # Next.js App Router pages
    page.tsx                    # Dashboard home (stats, recent runs)
    projects/
      page.tsx                  # Project list
      [projectId]/
        runs/page.tsx           # Run list for project
        runs/[runId]/page.tsx   # Run detail (results, scores, charts)
        datasets/page.tsx       # Dataset list for project
        datasets/[datasetId]/   # Dataset detail (test cases)
    compare/page.tsx            # Run comparison
    api/
      trpc/[trpc]/route.ts     # tRPC API handler
      events/[runId]/route.ts   # SSE endpoint for real-time progress
  trpc/
    server.ts                   # tRPC server setup, DB singleton
    routers/
      project.ts                # Project CRUD + stats
      dataset.ts                # Dataset CRUD + test cases
      eval-run.ts               # Run queries, scores, results, cancel
      comparison.ts             # Run-to-run comparison
  components/
    dashboard/                  # Dashboard-specific components
    ui/                         # Re-exported @llmbench/ui components
```

## Key Technologies

- **Next.js 15** — App Router with React Server Components
- **tRPC v11** — Type-safe API layer with SuperJSON serialization and Zod validation
- **@tanstack/react-query** — Server state management via tRPC hooks
- **Recharts** — Score distribution and latency charts
- **@llmbench/ui** — shadcn/ui component library with Tailwind CSS
- **better-sqlite3** — Externalized via webpack config for server-side only

## Database

The dashboard connects to the same SQLite file used by the CLI (`llmbench.db` by default). The DB singleton persists across Next.js HMR reloads via `globalThis`.

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool — starts the dashboard via `llmbench serve` |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine and SDK |
| [@llmbench/db](https://www.npmjs.com/package/@llmbench/db) | SQLite database layer |
| [@llmbench/ui](https://www.npmjs.com/package/@llmbench/ui) | React component library |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
