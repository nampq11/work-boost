import { Slack } from '@work-boost/services/slack/slack.ts';

async function test_slack() {
  const slack = new Slack();
  await slack.sendMessage([
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Hello, world!',
      },
    },
  ]);
}

test_slack();
