import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
	assertPortAvailable,
	chooseServeScript,
	createServePlan,
	findWebAppDirectory,
	parseServePort,
	resolveServeDbPath,
} from "../commands/serve.js";

const tempDirs: string[] = [];

function createTempDir() {
	const dir = mkdtempSync(join(tmpdir(), "llmbench-serve-"));
	tempDirs.push(dir);
	return dir;
}

function createWebPackage(root: string, relativePath = "apps/web") {
	const webDir = join(root, relativePath);
	mkdirSync(webDir, { recursive: true });
	writeFileSync(join(webDir, "package.json"), JSON.stringify({ name: "@llmbench/web" }));
	return webDir;
}

function createCommandImportMetaUrl(root: string) {
	const commandDir = join(root, "apps/cli/dist/commands");
	mkdirSync(commandDir, { recursive: true });
	return pathToFileURL(join(commandDir, "serve.js")).href;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("parseServePort", () => {
	it("defaults to port 3000", () => {
		expect(parseServePort(undefined)).toBe(3000);
	});

	it("rejects invalid ports", () => {
		expect(() => parseServePort("0")).toThrow("Invalid port");
		expect(() => parseServePort("70000")).toThrow("Invalid port");
		expect(() => parseServePort("3000abc")).toThrow("Invalid port");
		expect(() => parseServePort("abc")).toThrow("Invalid port");
	});
});

describe("resolveServeDbPath", () => {
	it("uses CLI --db before LLMBENCH_DB_PATH", () => {
		const cwd = createTempDir();
		const dbPath = resolveServeDbPath("./cli.db", { LLMBENCH_DB_PATH: "./env.db" }, cwd);

		expect(dbPath).toBe(resolve(cwd, "cli.db"));
	});

	it("uses LLMBENCH_DB_PATH before the default", () => {
		const cwd = createTempDir();
		const dbPath = resolveServeDbPath(undefined, { LLMBENCH_DB_PATH: "./env.db" }, cwd);

		expect(dbPath).toBe(resolve(cwd, "env.db"));
	});

	it("defaults to project-local llmbench.db", () => {
		const cwd = createTempDir();
		const dbPath = resolveServeDbPath(undefined, {}, cwd);

		expect(dbPath).toBe(resolve(cwd, "llmbench.db"));
	});
});

describe("findWebAppDirectory", () => {
	it("finds the monorepo web app relative to the built CLI command", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root);
		const importMetaUrl = createCommandImportMetaUrl(root);

		expect(findWebAppDirectory(importMetaUrl, root, {})).toBe(webDir);
	});

	it("uses LLMBENCH_WEB_DIR when provided", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root, "dashboard");

		expect(
			findWebAppDirectory(createCommandImportMetaUrl(root), root, {
				LLMBENCH_WEB_DIR: "dashboard",
			}),
		).toBe(webDir);
	});

	it("uses --web-dir before LLMBENCH_WEB_DIR", () => {
		const root = createTempDir();
		createWebPackage(root, "env-dashboard");
		const webDir = createWebPackage(root, "cli-dashboard");

		expect(
			findWebAppDirectory(
				createCommandImportMetaUrl(root),
				root,
				{ LLMBENCH_WEB_DIR: "env-dashboard" },
				"cli-dashboard",
			),
		).toBe(webDir);
	});

	it("fails clearly for an invalid LLMBENCH_WEB_DIR", () => {
		const root = createTempDir();

		expect(() =>
			findWebAppDirectory(createCommandImportMetaUrl(root), root, { LLMBENCH_WEB_DIR: "missing" }),
		).toThrow("LLMBENCH_WEB_DIR does not point to a web package");
	});

	it("fails clearly for an invalid --web-dir", () => {
		const root = createTempDir();

		expect(() =>
			findWebAppDirectory(createCommandImportMetaUrl(root), root, {}, "missing"),
		).toThrow("--web-dir does not point to a web package");
	});

	it("fails clearly when no web package can be found", () => {
		const root = createTempDir();

		expect(() => findWebAppDirectory(createCommandImportMetaUrl(root), root, {})).toThrow(
			"Could not locate the LLMBench web dashboard package",
		);
	});
});

describe("chooseServeScript", () => {
	it("uses development mode when the web app is not built", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root);

		expect(chooseServeScript(webDir)).toBe("dev");
	});

	it("uses production mode when a Next build exists", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root);
		mkdirSync(join(webDir, ".next"));

		expect(chooseServeScript(webDir)).toBe("start");
	});
});

describe("createServePlan", () => {
	it("builds a startup plan with resolved DB path, URL, and script", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root);
		const plan = createServePlan(
			{ port: "8080" },
			{ LLMBENCH_DB_PATH: "./studio.db" },
			root,
			createCommandImportMetaUrl(root),
		);

		expect(plan).toEqual({
			port: 8080,
			dbPath: resolve(root, "studio.db"),
			webDir,
			script: "dev",
			url: "http://localhost:8080",
		});
	});

	it("uses the explicit web directory in the startup plan", () => {
		const root = createTempDir();
		const webDir = createWebPackage(root, "dashboard");
		const plan = createServePlan(
			{ port: "8080", webDir: "dashboard" },
			{},
			root,
			createCommandImportMetaUrl(root),
		);

		expect(plan.webDir).toBe(webDir);
	});
});

describe("assertPortAvailable", () => {
	it("rejects ports that are already in use", async () => {
		const server = createServer();
		await new Promise<void>((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
		const port = (server.address() as AddressInfo).port;

		try {
			await expect(assertPortAvailable(port)).rejects.toThrow(`Port ${port} is already in use`);
		} finally {
			server.close();
		}
	});
});
