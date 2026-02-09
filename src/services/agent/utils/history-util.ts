export class MessageHistory {
  private model: string;
  private system: string;
  private contextWindowTokens: number;
  private client: any;
  private enableCaching: boolean = false;
  private messageTokens: Array<[number, number]> = [];

  constructor(
    model: string,
    system: string,
    contextWindowTokens: number,
    client: any,
    enableCaching: boolean = false,
  ) {
    this.model = model;
    this.system = system;
    this.contextWindowTokens = contextWindowTokens;
    this.client = client;
    this.enableCaching = enableCaching;
  }

  async addMessage(
    role: string,
    content: string | Record<string, unknown>,
    usage?: any | undefined,
  ): Promise<void> {
    let formattedContent: string | Record<string, unknown>[];

    if (typeof content === 'string') {
      formattedContent = [{ type: 'text' as const, text: content }];
    }

    // const message:
  }
}
