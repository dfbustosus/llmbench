import { execSync } from "node:child_process";
import { resolve } from "node:path";
import chalk from "chalk";
import { Command } from "commander";

export const serveCommand = new Command("serve")
	.description("Start the LLMBench web dashboard")
	.option("-p, --port <number>", "Port number", "3000")
	.option("--db <path>", "Database path", "./llmbench.db")
	.action(async (options) => {
		const port = options.port;
		const dbPath = resolve(process.cwd(), options.db);

		console.log(chalk.bold("Starting LLMBench Dashboard..."));
		console.log(`  Database: ${chalk.cyan(dbPath)}`);
		console.log(`  URL: ${chalk.cyan(`http://localhost:${port}`)}`);
		console.log();

		try {
			// Start the Next.js dev server
			const webDir = resolve(new URL(".", import.meta.url).pathname, "../../../web");

			execSync(`pnpm dev`, {
				cwd: webDir,
				stdio: "inherit",
				env: {
					...process.env,
					LLMBENCH_DB_PATH: dbPath,
					PORT: port,
				},
			});
		} catch {
			console.log(
				chalk.yellow("To use the web dashboard, ensure the @llmbench/web package is built."),
			);
			console.log(chalk.dim("Run: pnpm --filter @llmbench/web dev"));
		}
	});
