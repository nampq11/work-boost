import { Agent } from './services/agent/main.ts';
import { Database } from './services/database/database.ts';
import { Slack } from './services/slack/slack.ts';
import { TelegramService } from './services/telegram/telegram.ts';

function handle_test() {
  console.log('Handling test request');
}

export async function boostrap() {
  const db = await Database.init();
  const agent = await Agent.init(Deno.env.get('GOOGLE_API_KEY') || '');
  const slack = new Slack();
  const telegram = new TelegramService(db, agent);

  console.log('Database connected');

  Deno.serve({ port: 2002 }, async (req: Request) => {
    console.log('Method: ', req.method);

    const url = new URL(req.url);
    console.log('Path: ', url.pathname);
    console.log('Query parameters: ', url.searchParams);

    if (url.pathname == '/test') {
      handle_test();
    }

    // Slack webhooks (legacy routes)
    if (url.pathname == '/subscribe' && req.method === 'POST') {
      const body = await req.text();
      const params = new URLSearchParams(body);
      console.log(params);
      const userId = params.get('user_id');
      const username = params.get('user_name');
      if (userId && username) {
        // check if user exists
        const user = await db.getById(userId);
        if (user && user?.subscribed) {
          return new Response(
            JSON.stringify({
              response_type: 'ephemeral',
              text: 'Bạn đã đăng ký nhận thông báo trước đó rồi! 😊',
            }),
            {
              status: 200,
              headers: {
                'content-type': 'application/json;',
              },
            },
          );
        }
        await db.store({
          id: userId,
          username: username,
          subscribed: true,
        });
      }

      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ thông báo cho bạn mỗi sáng! 😊',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json;',
          },
        },
      );
    }

    if (url.pathname == '/unsubscribe' && req.method === 'POST') {
      const body = await req.text();
      const params = new URLSearchParams(body);
      const userId = params.get('user_id');
      if (userId) {
        const user = await db.getById(userId);
        if (user) {
          await db.store({
            id: user.id,
            username: user.username,
            subscribed: false,
          });
        }
      }
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Oke rồi, mình sẽ không thông báo cho bạn nữa! 😊',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json;',
          },
        },
      );
    }

    if (url.pathname == '/messages' && req.method === 'POST') {
      const body = await req.text();
      const params = new URLSearchParams(body);
      const userId = params.get('user_id');
      const text = params.get('text');
      if (userId && text) {
        const message = {
          id: crypto.randomUUID(),
          userId: userId,
          content: text,
          date: new Date(),
        };
        console.log(message);
        await db.storeDailyWorkMessage(message);

        // sent to agent
        const agentResponse = await agent.envoke({
          content: text,
          verbose: true,
        });

        const slackMessage = agent.formatToSlack(agentResponse);

        const blocks = [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: slackMessage,
            },
          },
        ];
        // send to slack
        await slack.sendMessageToChannel(blocks);
      }
      return new Response(
        JSON.stringify({
          response_type: 'ephemeral',
          text: 'Đã ghi nhận công việc của bạn! Tôi sẽ lên công việc cho bạn ngay!!!😊 ',
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json;',
          },
        },
      );
    }

    // Telegram webhook
    if (url.pathname.startsWith('/telegram')) {
      if (!(await telegram.validateWebhook(req))) {
        return new Response('Unauthorized', { status: 401 });
      }
      return await telegram.handleWebhook(req);
    }

    return new Response('Hello, world', {
      status: 200,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  });
}
boostrap();
