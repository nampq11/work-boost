import { Agent } from '../src/services/agent/main.ts';

async function test_agent() {
  console.log('Test agent');
  const apiKey = Deno.env.get('GOOGLE_API_KEY') || '';

  const agent = await Agent.init(apiKey);

  const response = await agent.envoke({
    content:
      'hoàn thành:B4: squirrel cai thien mo hinh, chưa hoàn thành N/A, dự định làm: B5: squirrel cai thien mo hinh',
    verbose: true,
  });

  console.log(response);

  const slackMessage = agent.formatToSlack(response);
  console.log(slackMessage);
}

test_agent();
