#!/usr/bin/env node
import { Command } from "commander";
import { compareCommand } from "./commands/compare.js";
import { evalCommand } from "./commands/eval.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { rescoreCommand } from "./commands/rescore.js";
import { runCommand } from "./commands/run.js";
import { serveCommand } from "./commands/serve.js";

const program = new Command();

program.name("llmbench").description("LLM Benchmarking & Evaluation Platform").version("0.1.3");

program.addCommand(initCommand);
program.addCommand(runCommand);
program.addCommand(evalCommand);
program.addCommand(listCommand);
program.addCommand(serveCommand);
program.addCommand(compareCommand);
program.addCommand(rescoreCommand);

program.parse();
