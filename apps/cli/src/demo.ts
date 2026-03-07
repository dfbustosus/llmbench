/**
 * LLMBench Demo — runs a full evaluation pipeline locally, no API keys needed.
 *
 * Usage:
 *   npx tsx demo/run-demo.ts
 */

import {
	createDB,
	initializeDB,
	ProjectRepository,
	DatasetRepository,
	TestCaseRepository,
	ProviderRepository,
	EvalRunRepository,
	EvalResultRepository,
	ScoreRepository,
	CostRecordRepository,
} from "@llmbench/db";
import {
	EvaluationEngine,
	CostCalculator,
	ExactMatchScorer,
	ContainsScorer,
	CosineSimilarityScorer,
	CustomProvider,
} from "@llmbench/core";
import { RunComparator } from "@llmbench/core";

// ── Fake LLM that returns canned answers ──────────────────────────────
const ANSWERS: Record<string, string> = {
	"What is the capital of France?": "Paris",
	"What is 2 + 2?": "4",
	"Who wrote Romeo and Juliet?": "William Shakespeare",
	"What color is the sky?": "The sky is blue",
	"What is the largest planet?": "Jupiter is the largest planet in our solar system",
};

function createFakeProvider(name: string, accuracy: number) {
	return new CustomProvider(
		{ type: "custom", name, model: `fake-${name.toLowerCase()}` },
		async (input) => {
			// Simulate latency
			const latency = 50 + Math.random() * 200;
			await new Promise((r) => setTimeout(r, latency));

			const answer = ANSWERS[input];
			// Simulate accuracy — sometimes return wrong answer
			const correct = Math.random() < accuracy;
			const output = correct && answer ? answer : "I don't know";

			return {
				output,
				latencyMs: latency,
				tokenUsage: {
					inputTokens: input.split(" ").length * 2,
					outputTokens: output.split(" ").length * 2,
					totalTokens: (input.split(" ").length + output.split(" ").length) * 2,
				},
			};
		},
	);
}

// ── Main ──────────────────────────────────────────────────────────────
async function main() {
	console.log("╔═══════════════════════════════════════╗");
	console.log("║       LLMBench Demo                   ║");
	console.log("╚═══════════════════════════════════════╝");
	console.log();

	// 1. Setup DB
	const db = createDB("./demo-llmbench.db");
	initializeDB(db);
	console.log("✓ Database created (demo-llmbench.db)");

	const projectRepo = new ProjectRepository(db);
	const datasetRepo = new DatasetRepository(db);
	const testCaseRepo = new TestCaseRepository(db);
	const providerRepo = new ProviderRepository(db);
	const evalRunRepo = new EvalRunRepository(db);
	const evalResultRepo = new EvalResultRepository(db);
	const scoreRepo = new ScoreRepository(db);
	const costRecordRepo = new CostRecordRepository(db);

	// 2. Create project + dataset
	const project = await projectRepo.create({
		name: "Demo Project",
		description: "Testing the full LLMBench pipeline",
	});
	console.log(`✓ Project created: ${project.name} (${project.id.slice(0, 8)})`);

	const dataset = await datasetRepo.create({
		projectId: project.id,
		name: "General Knowledge",
		description: "Basic Q&A test cases",
	});

	const testCases = [];
	for (const [input, expected] of Object.entries(ANSWERS)) {
		const tc = await testCaseRepo.create({
			datasetId: dataset.id,
			input,
			expected,
			orderIndex: testCases.length,
		});
		testCases.push(tc);
	}
	console.log(`✓ Dataset created: ${dataset.name} (${testCases.length} test cases)`);

	// 3. Create two fake providers with different accuracy
	const goodProvider = createFakeProvider("GoodModel", 0.9);
	const badProvider = createFakeProvider("BadModel", 0.5);

	const goodRecord = await providerRepo.create({
		projectId: project.id,
		type: "custom",
		name: "GoodModel",
		model: "fake-goodmodel",
		config: {},
	});
	const badRecord = await providerRepo.create({
		projectId: project.id,
		type: "custom",
		name: "BadModel",
		model: "fake-badmodel",
		config: {},
	});

	const providers = new Map([
		[goodRecord.id, goodProvider],
		[badRecord.id, badProvider],
	]);

	console.log("✓ Providers: GoodModel (90% accuracy) vs BadModel (50% accuracy)");

	// 4. Create scorers
	const scorers = [
		new ExactMatchScorer(),
		new ContainsScorer(),
		new CosineSimilarityScorer(),
	];
	console.log("✓ Scorers: Exact Match, Contains, Cosine Similarity");
	console.log();

	// ── Run 1 ─────────────────────────────────────────────────────────
	console.log("━━━ Run 1 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	const run1 = await evalRunRepo.create({
		projectId: project.id,
		datasetId: dataset.id,
		config: {
			providerIds: [goodRecord.id, badRecord.id],
			scorerConfigs: [],
			concurrency: 3,
			maxRetries: 1,
			timeoutMs: 10000,
		},
		totalCases: testCases.length * 2,
	});

	const engine1 = new EvaluationEngine({
		providers,
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
	});

	engine1.onEvent((event) => {
		if (event.type === "run:progress") {
			process.stdout.write(
				`\r  Progress: ${event.completedCases}/${event.totalCases} completed, ${event.failedCases} failed`,
			);
		}
	});

	await engine1.execute(run1, testCases);
	console.log();

	const finalRun1 = await evalRunRepo.findById(run1.id);
	console.log(`  Status: ${finalRun1!.status}`);
	console.log(`  Completed: ${finalRun1!.completedCases}/${finalRun1!.totalCases}`);
	console.log(`  Failed: ${finalRun1!.failedCases}`);

	// Print scores
	const results1 = await evalResultRepo.findByRunId(run1.id);
	console.log();
	console.log("  Results:");
	console.log("  ┌──────────────────────────────────────────────┐");
	for (const r of results1) {
		const provName =
			r.providerId === goodRecord.id ? "GoodModel" : "BadModel ";
		const resultScores = await scoreRepo.findByResultId(r.id);
		const exactScore = resultScores.find((s) => s.scorerName === "Exact Match");
		const mark = exactScore?.value === 1 ? "✓" : "✗";
		const inputShort = r.input.length > 30 ? r.input.slice(0, 30) + "…" : r.input;
		console.log(
			`  │ ${mark} ${provName} │ ${inputShort.padEnd(32)} │ ${r.output.slice(0, 15).padEnd(15)} │`,
		);
	}
	console.log("  └──────────────────────────────────────────────┘");

	// ── Run 2 (second run for comparison) ─────────────────────────────
	console.log();
	console.log("━━━ Run 2 (for comparison) ━━━━━━━━━━━━━━━━━━━━━━");

	const run2 = await evalRunRepo.create({
		projectId: project.id,
		datasetId: dataset.id,
		config: {
			providerIds: [goodRecord.id, badRecord.id],
			scorerConfigs: [],
			concurrency: 3,
			maxRetries: 1,
			timeoutMs: 10000,
		},
		totalCases: testCases.length * 2,
	});

	const engine2 = new EvaluationEngine({
		providers,
		scorers,
		evalRunRepo,
		evalResultRepo,
		scoreRepo,
		costRecordRepo,
		costCalculator: new CostCalculator(),
	});

	engine2.onEvent((event) => {
		if (event.type === "run:progress") {
			process.stdout.write(
				`\r  Progress: ${event.completedCases}/${event.totalCases} completed, ${event.failedCases} failed`,
			);
		}
	});

	await engine2.execute(run2, testCases);
	console.log();

	const finalRun2 = await evalRunRepo.findById(run2.id);
	console.log(`  Status: ${finalRun2!.status}`);
	console.log(`  Completed: ${finalRun2!.completedCases}/${finalRun2!.totalCases}`);
	console.log();

	// ── Compare runs ──────────────────────────────────────────────────
	console.log("━━━ Run Comparison ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

	const comparator = new RunComparator(evalRunRepo, evalResultRepo, scoreRepo);
	const comparison = await comparator.compare(run1.id, run2.id);

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
	console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
	console.log("✓ Demo complete! Database saved to demo-llmbench.db");
	console.log();
	console.log("Next steps:");
	console.log("  • View the web dashboard:  node apps/cli/dist/index.js serve --db demo-llmbench.db");
	console.log("  • List runs:               node apps/cli/dist/index.js list --db demo-llmbench.db");
	console.log(`  • Compare runs:            node apps/cli/dist/index.js compare ${run1.id.slice(0, 8)} ${run2.id.slice(0, 8)} --db demo-llmbench.db`);

	// Cleanup
	process.exit(0);
}

main().catch((err) => {
	console.error("Demo failed:", err);
	process.exit(1);
});
