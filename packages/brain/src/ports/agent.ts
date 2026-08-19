/**
 * Minimal agent interface consumed by all platform services (API, Slack, Telegram).
 *
 * The agent processes a user message through its tool-calling loop and returns
 * the full assistant response as a string.
 */
export interface AgentPort {
  /**
   * Process a user message and return the agent's response text.
   *
   * @param message - The user's message (already stripped of command prefixes).
   * @param options - Optional session and abort control.
   * @param options.sessionId - Conversation session ID (e.g. Telegram chatId).
   *   Different session IDs maintain separate conversation histories. If not
   *   provided, a default singleton session is used.
   * @param options.signal - Abort signal to cancel the agent loop.
   * @returns The complete assistant response text.
   */
  stream(message: string, options?: { sessionId?: string; signal?: AbortSignal }): Promise<string>;

  /**
   * Remove a session, clearing its conversation history.
   * The next call to `stream` with the same sessionId will start a fresh session.
   */
  removeSession(sessionId: string): boolean;
}
