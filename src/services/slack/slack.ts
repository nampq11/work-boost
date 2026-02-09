export class Slack {
  private baseUrl: string = `https://slack.com`;
  private slackBotToken: string;
  private channelID: string;
  constructor() {
    this.slackBotToken = Deno.env.get('SLACK_BOT_TOKEN') || '';
    this.channelID = Deno.env.get('SLACK_CHANNEL_ID') || '';
  }

  async sendMessage(blocks: object): Promise<void> {
    const url = `${this.baseUrl}/api/chat.postMessage`;
    const payload = JSON.stringify({
      channel: this.channelID,
      blocks,
    });

    console.log(payload);

    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${this.slackBotToken}`,
        Accept: 'application/json',
      },
      body: payload,
    };

    console.log(requestOptions);

    try {
      const response = await fetch(url, requestOptions);

      if (!response.ok) {
        throw new Error(`HTTP error status: ${response.status}`);
      }
      const responseJson = await response.json();

      console.log(responseJson);
    } catch (error) {
      console.error(error);
    }
  }
}
