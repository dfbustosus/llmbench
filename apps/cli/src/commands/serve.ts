import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";
import { Command } from "commander";

interface ServeOptions {
	port?: string;
	db?: string;
	webDir?: string;
}

export interface ServePlan {
	port: number;
	dbPath: string;
	webDir: string;
	script: "dev" | "start";
	url: string;
}

function isDirectory(path: string): boolean {
	return existsSync(path);
}

function hasWebPackage(path: string): boolean {
	return existsSync(resolve(path, "package.json"));
}

export function parseServePort(value: string | undefined): number {
	const rawPort = value ?? "3000";
	const port = Number.parseInt(rawPort, 10);
	if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`Invalid port "${value}". Use a number between 1 and 65535.`);
	}
	return port;
}

export function resolveServeDbPath(
	input: string | undefined,
	env: NodeJS.ProcessEnv,
	cwd: string,
): string {
	const dbPath = input ?? env.LLMBENCH_DB_PATH ?? "./llmbench.db";
	return resolve(cwd, dbPath);
}

export function findWebAppDirectory(
	importMetaUrl: string,
	cwd: string,
	env: NodeJS.ProcessEnv,
	webDirInput?: string,
): string {
	const explicitWebDir = webDirInput ?? env.LLMBENCH_WEB_DIR;
	if (explicitWebDir) {
		const resolved = resolve(cwd, explicitWebDir);
		if (!hasWebPackage(resolved)) {
			const source = webDirInput ? "--web-dir" : "LLMBENCH_WEB_DIR";
			throw new Error(`${source} does not point to a web package: ${resolved}`);
		}
		return resolved;
	}

	const commandDir = dirname(fileURLToPath(importMetaUrl));
	const candidates = [
		resolve(commandDir, "../../../web"),
		resolve(cwd, "apps/web"),
		resolve(cwd, "../web"),
	];

	const webDir = candidates.find(hasWebPackage);
	if (!webDir) {
		throw new Error(
			"Could not locate the LLMBench web dashboard package. " +
				"Run from the monorepo root, pass --web-dir, or set LLMBENCH_WEB_DIR to apps/web.",
		);
	}

	return webDir;
}

export function chooseServeScript(webDir: string): "dev" | "start" {
	return isDirectory(resolve(webDir, ".next")) ? "start" : "dev";
}

export async function assertPortAvailable(port: number): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		const server = createServer();
		server.once("error", (error: NodeJS.ErrnoException) => {
			if (error.code === "EADDRINUSE") {
				reject(new Error(`Port ${port} is already in use. Choose another port with --port.`));
				return;
			}
			reject(error);
		});
		server.once("listening", () => {
			server.close(() => resolvePromise());
		});
		server.listen(port, "127.0.0.1");
	});
}

export function createServePlan(
	options: ServeOptions,
	env: NodeJS.ProcessEnv,
	cwd: string,
	importMetaUrl = import.meta.url,
): ServePlan {
	const port = parseServePort(options.port);
	const dbPath = resolveServeDbPath(options.db, env, cwd);
	const webDir = findWebAppDirectory(importMetaUrl, cwd, env, options.webDir);
	return {
		port,
		dbPath,
		webDir,
		script: chooseServeScript(webDir),
		url: `http://localhost:${port}`,
	};
}

function runWebServer(plan: ServePlan): Promise<void> {
	const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	const child = spawn(command, [plan.script], {
		cwd: plan.webDir,
		stdio: "inherit",
		env: {
			...process.env,
			LLMBENCH_DB_PATH: plan.dbPath,
			PORT: String(plan.port),
		},
	});

	return new Promise((resolvePromise, reject) => {
		child.once("error", reject);
		child.once("exit", (code) => {
			if (code && code !== 0) {
				reject(new Error(`Dashboard server exited with code ${code}`));
				return;
			}
			resolvePromise();
		});
	});
}

export const serveCommand = new Command("serve")
	.description("Start the LLMBench web dashboard")
	.option("-p, --port <number>", "Port number", "3000")
	.option("--db <path>", "Database path. Defaults to LLMBENCH_DB_PATH or ./llmbench.db")
	.option("--web-dir <path>", "Web dashboard package directory. Defaults to LLMBENCH_WEB_DIR")
	.action(async (options: ServeOptions) => {
		try {
			const plan = createServePlan(options, process.env, process.cwd());
			await assertPortAvailable(plan.port);

			console.log(chalk.bold("Starting LLMBench Dashboard..."));
			console.log(`  Database: ${chalk.cyan(plan.dbPath)}`);
			console.log(`  Web app:  ${chalk.cyan(plan.webDir)}`);
			console.log(`  Mode:     ${plan.script === "start" ? "production" : "development"}`);
			console.log(`  URL:      ${chalk.cyan(plan.url)}`);
			console.log();

			await runWebServer(plan);
		} catch (error) {
			console.error(chalk.red("Failed to start LLMBench Dashboard."));
			console.error(error instanceof Error ? error.message : String(error));
			console.error();
			console.error(chalk.dim("Tips:"));
			console.error(chalk.dim("  - Run from the LLMBench monorepo root, or pass --web-dir."));
			console.error(chalk.dim("  - Run pnpm install if dependencies are missing."));
			console.error(chalk.dim("  - Run pnpm --filter @llmbench/web build for production mode."));
			process.exitCode = 1;
		}
	});
