import { Command } from "commander";
import { logger } from "../core/logger/logger.ts";
import { registerAgentCommand, registerMainAgentCommand } from "./cli/cli.ts";
import process from "node:process";

const program = new Command();

// Register sub-commands
registerAgentCommand(program);
registerMainAgentCommand(program);

program
  .name("work-boost")
  .description(
    "A productivity tool designed to help you manage and track your daily work tasks efficiently.",
  )
  .version("0.0.0")
  .argument(
    "[prompt...]",
    "Natural-language prompt to run once. If not passed, work-boost will start in interactive mode",
  )
  .option(
    "--mode <mode>",
    "The application mode for work-boost agent - cli | api",
    "cli",
  );

program
  .description(
    "Work Boost CLI allows you to interact with Work Boost Agent.\n" +
      "Run work-boost in interactive mode with `work-boost`\n\n" +
      "Available Modes:\n" +
      " - cli: Interactive command-line interface (default)\n" +
      " - api: REST API server mode with Websocket support\n",
  )
  .action(async (prompt: string[] = []) => {
    const headlessInput = prompt.join(" ") || undefined;

    // Parse CLI options first
    const opts = program.opts();

    // Dispatch based on --mode
    switch (opts.mode) {
      case "cli":
        console.log("Starting Work Boost in CLI mode...");
        break;
      case "api":
        console.log("Starting Work Boost in API mode...");
        break;
      default: {
        const errorMsg = `Unknown mode '${opts.mode}'. Use cli, api`;
        logger.error(errorMsg);
        process.exit(1);
      }
    }
  });

program.parseAsync(process.argv);
