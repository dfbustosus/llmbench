import { DEFAULT_CONFIG } from "@llmbench/core";
import { createDB, EvalRunRepository, initializeDB, ProjectRepository } from "@llmbench/db";
import chalk from "chalk";
import Table from "cli-table3";
import { Command } from "commander";

export const listCommand = new Command("list")
	.description("List evaluation runs")
	.option("--project <name>", "Filter by project name")
	.option("--limit <number>", "Max results", "20")
	.option("--db <path>", "Database path")
	.action(async (options) => {
		try {
			const dbPath = options.db || DEFAULT_CONFIG.dbPath || "./llmbench.db";
			const db = createDB(dbPath);
			initializeDB(db);

			const projectRepo = new ProjectRepository(db);
			const runRepo = new EvalRunRepository(db);

			const projects = await projectRepo.findAll();

			if (projects.length === 0) {
				console.log(chalk.yellow("No projects found. Run 'llmbench init' first."));
				return;
			}

			const filteredProjects = options.project
				? projects.filter((p) => p.name.toLowerCase().includes(options.project.toLowerCase()))
				: projects;

			for (const project of filteredProjects) {
				console.log(chalk.bold(`\nProject: ${project.name}`));

				const runs = await runRepo.findByProjectId(project.id, Number(options.limit));

				if (runs.length === 0) {
					console.log(chalk.dim("  No runs yet"));
					continue;
				}

				const table = new Table({
					head: [
						"Run ID",
						"Status",
						"Cases",
						"Completed",
						"Failed",
						"Cost",
						"Avg Latency",
						"Created",
					],
					style: { head: ["cyan"] },
				});

				for (const run of runs) {
					const statusColor =
						run.status === "completed"
							? chalk.green
							: run.status === "failed"
								? chalk.red
								: chalk.yellow;
					table.push([
						run.id.slice(0, 8),
						statusColor(run.status),
						String(run.totalCases),
						String(run.completedCases),
						String(run.failedCases),
						run.totalCost ? `$${run.totalCost.toFixed(4)}` : "-",
						run.avgLatencyMs ? `${run.avgLatencyMs.toFixed(0)}ms` : "-",
						new Date(run.createdAt).toLocaleDateString(),
					]);
				}

				console.log(table.toString());
			}
		} catch (error) {
			console.error(chalk.red(error instanceof Error ? error.message : String(error)));
			process.exit(1);
		}
	});
