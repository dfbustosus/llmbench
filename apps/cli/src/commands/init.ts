import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";

export const initCommand = new Command("init")
	.description("Initialize a new LLMBench project")
	.option("-n, --name <name>", "Project name", "my-eval-project")
	.action(async (options) => {
		const cwd = process.cwd();
		const configPath = resolve(cwd, "llmbench.config.ts");

		if (existsSync(configPath)) {
			console.log(chalk.yellow("llmbench.config.ts already exists. Skipping."));
			return;
		}

		const configContent = `import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
	projectName: "${options.name}",
	description: "My LLM evaluation project",

	providers: [
		{
			type: "openai",
			name: "GPT-4o",
			model: "gpt-4o",
		},
	],

	scorers: [
		{
			id: "exact-match",
			name: "Exact Match",
			type: "exact-match",
		},
		{
			id: "contains",
			name: "Contains",
			type: "contains",
		},
	],

	defaults: {
		concurrency: 5,
		maxRetries: 3,
		timeoutMs: 30000,
	},
};

export default config;
`;

		writeFileSync(configPath, configContent);
		console.log(chalk.green("Created llmbench.config.ts"));

		// Create datasets directory
		const datasetsDir = resolve(cwd, "datasets");
		if (!existsSync(datasetsDir)) {
			mkdirSync(datasetsDir, { recursive: true });
			console.log(chalk.green("Created datasets/ directory"));
		}

		// Create example dataset
		const exampleDataset = resolve(datasetsDir, "example.json");
		if (!existsSync(exampleDataset)) {
			const exampleData = JSON.stringify(
				{
					name: "Example Dataset",
					testCases: [
						{
							input: "What is the capital of France?",
							expected: "Paris",
						},
						{
							input: "What is 2 + 2?",
							expected: "4",
						},
						{
							input: "Who wrote Romeo and Juliet?",
							expected: "Shakespeare",
						},
					],
				},
				null,
				2,
			);
			writeFileSync(exampleDataset, exampleData);
			console.log(chalk.green("Created datasets/example.json"));
		}

		console.log();
		console.log(chalk.bold("Next steps:"));
		console.log(`  1. Set your API key: ${chalk.cyan("export OPENAI_API_KEY=sk-...")}`);
		console.log(
			`  2. Run your first eval: ${chalk.cyan("npx llmbench run --dataset datasets/example.json")}`,
		);
		console.log(`  3. View results: ${chalk.cyan("npx llmbench serve")}`);
	});
