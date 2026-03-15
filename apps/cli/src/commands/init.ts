import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";

const YAML_CONFIG_TEMPLATE = (name: string) => `projectName: "${name}"
description: "My LLM evaluation project"

providers:
  - type: openai
    name: GPT-4o
    model: gpt-4o

scorers:
  - id: exact-match
    name: Exact Match
    type: exact-match
  - id: contains
    name: Contains
    type: contains

defaults:
  concurrency: 5
  maxRetries: 3
  timeoutMs: 30000
`;

const YAML_DATASET_TEMPLATE = `name: Example Dataset
testCases:
  - input: "What is the capital of France?"
    expected: "Paris"

  - input: "What is 2 + 2?"
    expected: "4"
    assert:
      - type: exact-match
        value: "4"
      - type: contains
        value: "4"

  - input: "Who wrote Romeo and Juliet?"
    expected: "Shakespeare"
    assert:
      - type: contains
        value: "Shakespeare"
`;

const TS_CONFIG_TEMPLATE = (name: string) => `import type { LLMBenchConfig } from "@llmbench/types";

const config: LLMBenchConfig = {
	projectName: "${name}",
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

export const initCommand = new Command("init")
	.description("Initialize a new LLMBench project")
	.option("-n, --name <name>", "Project name", "my-eval-project")
	.option("-f, --format <format>", "Config format: ts or yaml", "ts")
	.action(async (options) => {
		const cwd = process.cwd();
		const format = options.format.toLowerCase();

		if (format !== "ts" && format !== "yaml") {
			console.error(chalk.red('Invalid format. Use "ts" or "yaml".'));
			process.exit(1);
		}

		const isYaml = format === "yaml";
		const configFile = isYaml ? "llmbench.config.yaml" : "llmbench.config.ts";
		const configPath = resolve(cwd, configFile);

		if (existsSync(configPath)) {
			console.log(chalk.yellow(`${configFile} already exists. Skipping.`));
			return;
		}

		const configContent = isYaml
			? YAML_CONFIG_TEMPLATE(options.name)
			: TS_CONFIG_TEMPLATE(options.name);
		writeFileSync(configPath, configContent);
		console.log(chalk.green(`Created ${configFile}`));

		// Create datasets directory
		const datasetsDir = resolve(cwd, "datasets");
		if (!existsSync(datasetsDir)) {
			mkdirSync(datasetsDir, { recursive: true });
			console.log(chalk.green("Created datasets/ directory"));
		}

		// Create example dataset
		const datasetExt = isYaml ? "yaml" : "json";
		const exampleDataset = resolve(datasetsDir, `example.${datasetExt}`);
		if (!existsSync(exampleDataset)) {
			let datasetContent: string;
			if (isYaml) {
				datasetContent = YAML_DATASET_TEMPLATE;
			} else {
				datasetContent = JSON.stringify(
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
			}
			writeFileSync(exampleDataset, datasetContent);
			console.log(chalk.green(`Created datasets/example.${datasetExt}`));
		}

		console.log();
		console.log(chalk.bold("Next steps:"));
		console.log(`  1. Set your API key: ${chalk.cyan("export OPENAI_API_KEY=sk-...")}`);
		console.log(
			`  2. Run your first eval: ${chalk.cyan(`npx @llmbench/cli run --dataset datasets/example.${datasetExt}`)}`,
		);
		console.log(`  3. View results: ${chalk.cyan("npx @llmbench/cli serve")}`);
	});
