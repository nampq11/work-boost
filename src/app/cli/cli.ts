import { Command } from "commander";
import { LoopAgent } from "../../core/brain/agent/agent.ts";
import { logger } from "../../core/logger/logger.ts";

export function registerAgentCommand(program: Command): void {
  const agentCmd = new Command('agent')
    .description('Run the autonomous loop agent')
    .argument('[task...]', 'Task description for the agent to execute')
    .option('-v, --verbose', 'Enable verbose output', false)
    .option('-i, --max-iterations <number>', 'Maximum iterations', '10')
    .action(async (task: string[] = [], options) => {
      const taskStr = task.join(' ') || 'Help me understand the current project structure';

      const apiKey = Deno.env.get('GOOGLE_API_KEY');
      if (!apiKey) {
        logger.error('GOOGLE_API_KEY environment variable is required');
        Deno.exit(1);
      }

      logger.info(`Starting Loop Agent with task: ${taskStr}`);

      const agent = new LoopAgent(apiKey, {
        maxIterations: parseInt(options.maxIterations, 10),
      });

      try {
        const result = await agent.run(taskStr, options.verbose);
        logger.info('\n=== Result ===');
        logger.info(result);
      } catch (error) {
        logger.error(`Agent error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        Deno.exit(1);
      }
    });

  program.addCommand(agentCmd);
}
