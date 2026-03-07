#!/usr/bin/env node
import { Command } from "commander";
import { compareCommand } from "./commands/compare.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program.name("llmbench").description("LLM Benchmarking & Evaluation Platform").version("0.1.1");

program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(listCommand);
program.addCommand(serveCommand);
program.addCommand(compareCommand);

program.parse();
