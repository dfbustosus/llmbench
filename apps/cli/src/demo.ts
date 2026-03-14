/**
 * LLMBench Demo — runs a full evaluation pipeline locally, no API keys needed.
 *
 * Usage:
 *   npx tsx apps/cli/src/demo.ts
 */

import type { CustomGenerateFn } from "@llmbench/core";
import { evaluate, RunComparator } from "@llmbench/core";
import {
	createDB,
	EvalResultRepository,
	EvalRunRepository,
	initializeDB,
	ScoreRepository,
} from "@llmbench/db";

// ── Fake LLM that returns canned answers ──────────────────────────────
const ANSWERS: Record<string, string> = {
	"What is the capital of France?": "Paris",
	"What is 2 + 2?": "4",
	"Who wrote Romeo and Juliet?": "William Shakespeare",
	"What color is the sky?": "The sky is blue",
	"What is the largest planet?": "Jupiter is the largest planet in our solar system",
};

function createFakeGenerateFn(accuracy: number): CustomGenerateFn {
	return async (input) => {
		const text = typeof input === "string" ? input : input.map((m) => m.content).join(" ");
		const latency = 50 + Math.random() * 200;
		await new Promise((r) => setTimeout(r, latency));

		const answer = ANSWERS[text];
		const correct = Math.random() < accuracy;
		const output = correct && answer ? answer : "I don't know";

		return {
			output,
			latencyMs: latency,
			tokenUsage: {
				inputTokens: text.split(" ").length * 2,
				outputTokens: output.split(" ").length * 2,
				totalTokens: (text.split(" ").length + output.split(" ").length) * 2,
			},
		};
	};
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
	console.log("╔═══════════════════════════════════════╗");
	console.log("║       LLMBench Demo (SDK API)         ║");
	console.log("╚═══════════════════════════════════════╝");
	console.log();

	const DB_PATH = "./demo-llmbench.db";

	const testCases = Object.entries(ANSWERS).map(([input, expected]) => ({ input, expected }));

	const providers = [
		{ type: "custom" as const, name: "GoodModel", model: "fake-goodmodel" },
		{ type: "custom" as const, name: "BadModel", model: "fake-badmodel" },
	];

	const customProviders = new Map<string, CustomGenerateFn>([
		["GoodModel", createFakeGenerateFn(0.9)],
		["BadModel", createFakeGenerateFn(0.5)],
	]);

	const scorers = [
		{ id: "exact-match", name: "Exact Match", type: "exact-match" as const },
		{ id: "contains", name: "Contains", type: "contains" as const },
		{ id: "cosine", name: "Cosine Similarity", type: "cosine-similarity" as const },
	];

	const sharedConfig = {
		testCases,
		providers,
		scorers,
		dbPath: DB_PATH,
		projectName: "Demo Project",
		datasetName: "General Knowledge",
		concurrency: 3,
		maxRetries: 1,
		timeoutMs: 10000,
		customProviders,
		onEvent: (event: {
			type: string;
			completedCases?: number;
			totalCases?: number;
			failedCases?: number;
		}) => {
			if (event.type === "run:progress") {
				process.stdout.write(
					`\r  Progress: ${event.completedCases}/${event.totalCases} completed, ${event.failedCases} failed`,
				);
			}
		},
	};

	// ── Run 1 ─────────────────────────────────────────────────────────
	console.log("━━━ Run 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	const result1 = await evaluate(sharedConfig);

	console.log();
	console.log(`  Status: ${result1.status}`);
	console.log(`  Completed: ${result1.summary.completedCases}/${result1.summary.totalCases}`);
	console.log(`  Failed: ${result1.summary.failedCases}`);
	console.log(`  Duration: ${result1.summary.durationMs}ms`);
	console.log();
	console.log("  Scorer Averages:");
	for (const [name, avg] of Object.entries(result1.scorerAverages)) {
		console.log(`    ${name}: ${avg.toFixed(3)}`);
	}

	// ── Run 2 (for comparison) ───────────────────────────────────────
	console.log();
	console.log("━━━ Run 2 (for comparison) ━━━━━━━━━━━━━━━━━━━━━━━━");

	const result2 = await evaluate(sharedConfig);

	console.log();
	console.log(`  Status: ${result2.status}`);
	console.log(`  Completed: ${result2.summary.completedCases}/${result2.summary.totalCases}`);
	console.log(`  Duration: ${result2.summary.durationMs}ms`);
	console.log();

	// ── Compare runs ──────────────────────────────────────────────────
	console.log("━━━ Run Comparison ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	const db = createDB(DB_PATH);
	initializeDB(db);
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);

	const comparator = new RunComparator(evalRunRepo, evalResultRepo, scoreRepo);
	const comparison = await comparator.compare(result1.run.id, result2.run.id);

	console.log("  Score Comparisons:");
	for (const sc of comparison.scorerComparisons) {
		const arrow = sc.delta > 0 ? "↑" : sc.delta < 0 ? "↓" : "=";
		console.log(
			`    ${sc.scorerName}: ${sc.avgScoreA.toFixed(3)} → ${sc.avgScoreB.toFixed(3)} (${arrow} ${sc.delta.toFixed(3)})`,
		);
	}

	if (comparison.regressions.length > 0) {
		console.log(`\n  Regressions detected: ${comparison.regressions.length}`);
		for (const reg of comparison.regressions) {
			console.log(
				`    [${reg.severity.toUpperCase()}] ${reg.scorerName}: ${reg.scoreA.toFixed(2)} → ${reg.scoreB.toFixed(2)}`,
			);
		}
	} else {
		console.log("\n  No regressions detected.");
	}

	console.log();
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log(`✓ Demo complete! Database saved to ${DB_PATH}`);

	process.exit(0);
}

main().catch((err) => {
	console.error("Demo failed:", err);
	process.exit(1);
});
