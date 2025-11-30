import { logger } from "../../logger/logger.ts";
import { AgentConfig } from "./config.ts";

export class Agent {

    private currentDefaultSessionId: string = 'default';
    private currentActiveSessionId: string = 'default'; // will be set property in constructor

    private config: AgentConfig;
    private appMode: 'cli' | 'mcp' | 'api' | null = null;

    constructor(config: AgentConfig, appMode?: 'cli' | 'mcp' | 'api') {
        this.config = config;
        this.appMode = appMode || null;

        // Set session ID based on mode
        if (appMode === 'cli') {
            this.currentActiveSessionId = this.currentDefaultSessionId;
        } else {
            // For API/MCP, generate unique session IDs
            this.currentActiveSessionId = this.generateUniqueSessionId();
        }
        if (appMode !== 'cli') {
            logger.debug('Agent created');
        }
    }

    /**
     * Generate a unique session ID for API/MCP modes
     * CLI mode uses the default session for persistence
     */
    private generateUniqueSessionId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        return `session-${timestamp}-${random}`;
    }
}