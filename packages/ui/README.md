<div align="center">

# @llmbench/ui

**React component library for the LLMBench web dashboard.**

[![npm version](https://img.shields.io/npm/v/@llmbench/ui.svg)](https://www.npmjs.com/package/@llmbench/ui)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)

</div>

---

Shared React components used by the LLMBench web dashboard. Built with Tailwind CSS and [class-variance-authority (CVA)](https://cva.style) for variant-based styling.

## Installation

```bash
npm install @llmbench/ui
```

**Peer dependency:** `react` >= 19.0.0

## Setup

Import the global CSS in your app's entry point:

```typescript
import "@llmbench/ui/globals.css";
```

## Components

### Button

```tsx
import { Button } from "@llmbench/ui";

// Variants: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
// Sizes: "default" | "sm" | "lg" | "icon"

<Button variant="default" size="default">Run Evaluation</Button>
<Button variant="destructive" size="sm">Delete Run</Button>
<Button variant="outline">Export Results</Button>
<Button variant="ghost" size="icon"><TrashIcon /></Button>
<Button variant="link">View Documentation</Button>

// Supports all HTML button attributes
<Button disabled onClick={() => runEval()}>Processing...</Button>
```

### Card

Compound component for content containers:

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@llmbench/ui";

<Card>
  <CardHeader>
    <CardTitle>Evaluation Run #42</CardTitle>
    <CardDescription>GPT-4o vs Claude Sonnet on QA tasks</CardDescription>
  </CardHeader>
  <CardContent>
    <p>Completed 150/150 test cases</p>
    <p>Average score: 0.87</p>
  </CardContent>
</Card>
```

### Badge

```tsx
import { Badge } from "@llmbench/ui";

// Variants: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"

<Badge variant="success">Completed</Badge>
<Badge variant="destructive">Failed</Badge>
<Badge variant="warning">Running</Badge>
<Badge variant="outline">Pending</Badge>
<Badge variant="secondary">Draft</Badge>
```

### ScoreBadge

Automatically selects a color variant based on the score value:

```tsx
import { ScoreBadge } from "@llmbench/ui";

<ScoreBadge score={0.95} />                    // Green: "95%"
<ScoreBadge score={0.65} label="Accuracy" />   // Yellow: "Accuracy: 65%"
<ScoreBadge score={0.30} />                    // Red: "30%"

// Thresholds:
//   >= 0.8 → success (green)
//   >= 0.5 → warning (yellow)
//   <  0.5 → destructive (red)
```

### CostDisplay

Formats USD costs with intelligent decimal precision:

```tsx
import { CostDisplay } from "@llmbench/ui";

<CostDisplay cost={1.50} />      // "$1.50"     (>= $1: 2 decimals)
<CostDisplay cost={0.0123} />    // "$0.0123"   (< $1: 4 decimals)
<CostDisplay cost={0.000001} />  // "$0.000001" (< $0.01: 6 decimals)

<CostDisplay cost={0.05} className="text-red-500" />
```

### Dialog

Modal dialog built on Radix UI primitives:

```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@llmbench/ui";

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Project</DialogTitle>
      <DialogDescription>Add a new evaluation project.</DialogDescription>
    </DialogHeader>
    {/* form content */}
    <DialogFooter>
      <Button onClick={() => setOpen(false)}>Cancel</Button>
      <Button onClick={handleCreate}>Create</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

### ConfirmDialog

Pre-built confirmation dialog with loading and error states:

```tsx
import { ConfirmDialog } from "@llmbench/ui";

<ConfirmDialog
  open={open}
  onOpenChange={setOpen}
  title="Delete Run"
  description="This will permanently delete this evaluation run."
  onConfirm={() => deleteMutation.mutate(runId)}
  loading={deleteMutation.isPending}
  error={errorMessage}
/>
```

### Form Components

```tsx
import { Input, Label, Select, Textarea } from "@llmbench/ui";

<Label htmlFor="name">Project Name</Label>
<Input id="name" placeholder="my-project" />
<Textarea placeholder="Description..." />
<Select value={value} onChange={handleChange}>
  <option value="openai">OpenAI</option>
</Select>
```

## Utilities

### `cn` — Class Name Merger

Combines `clsx` and `tailwind-merge` for intelligent Tailwind class merging:

```typescript
import { cn } from "@llmbench/ui";

cn("px-4 py-2", "px-6");           // "px-6 py-2" (px-4 overridden)
cn("text-red-500", isActive && "text-blue-500"); // conditional classes
cn("base-class", className);       // merge with external className prop
```

## Variant References

### buttonVariants

```typescript
import { buttonVariants } from "@llmbench/ui";

// Use as a className generator (e.g., for links styled as buttons)
<a className={buttonVariants({ variant: "outline", size: "sm" })}>
  View Report
</a>
```

### badgeVariants

```typescript
import { badgeVariants } from "@llmbench/ui";

<span className={badgeVariants({ variant: "success" })}>
  Active
</span>
```

## All Exports

| Export | Type | Description |
|--------|------|-------------|
| `Button` | Component | Multi-variant button |
| `buttonVariants` | CVA | Button class generator |
| `ButtonProps` | Type | Button prop types |
| `Card` | Component | Container root |
| `CardHeader` | Component | Card header section |
| `CardTitle` | Component | Card title text |
| `CardDescription` | Component | Card subtitle text |
| `CardContent` | Component | Card body section |
| `Badge` | Component | Multi-variant badge |
| `badgeVariants` | CVA | Badge class generator |
| `BadgeProps` | Type | Badge prop types |
| `Dialog` | Component | Modal dialog root |
| `DialogContent` | Component | Dialog content container |
| `DialogHeader` | Component | Dialog header section |
| `DialogTitle` | Component | Dialog title text |
| `DialogDescription` | Component | Dialog description text |
| `DialogFooter` | Component | Dialog footer section |
| `ConfirmDialog` | Component | Pre-built confirmation dialog |
| `ConfirmDialogProps` | Type | ConfirmDialog prop types |
| `Input` | Component | Text input field |
| `Label` | Component | Form label |
| `Select` | Component | Select dropdown |
| `Textarea` | Component | Multi-line text input |
| `ScoreBadge` | Component | Auto-colored score display |
| `CostDisplay` | Component | USD cost formatter |
| `cn` | Utility | Tailwind class merger |

## Related Packages

| Package | Description |
|---------|-------------|
| [@llmbench/cli](https://www.npmjs.com/package/@llmbench/cli) | CLI tool (includes `llmbench serve` to launch the dashboard) |
| [@llmbench/core](https://www.npmjs.com/package/@llmbench/core) | Evaluation engine, providers, and scorers |
| [@llmbench/types](https://www.npmjs.com/package/@llmbench/types) | TypeScript type definitions |

## License

[Apache License 2.0](https://github.com/dfbustosus/llmbench/blob/main/LICENSE)
