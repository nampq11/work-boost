import { GoogleGenAI } from "@google/genai";

export class ModelConfig {
    model: string;
    maxTokens?: number;
    temperature?: number;
    contextWindowTokens?: number;

    constructor(
        model: string = "gemini-1.5-flash",
        maxTokens: number = 1024,
        temperature: number = 0.2,
        contextWindowTokens: number = 8192
    ) {
        this.model = model;
        this.maxTokens = maxTokens;
        this.temperature = temperature;
        this.contextWindowTokens = contextWindowTokens;
    }
}

export class Agent {
    private name: string;
    private system: string;
    private tools: string[];
    private mcpServers: string[];
    private config: ModelConfig;
    private verbose: boolean = false;
    private client: GoogleGenAI;
    private messageParams: any;
    private history: any[] = [];

    constructor(
        name: string,
        system: string,
        tools: string[],
        mcpServers: string[],
        config: ModelConfig,
        client: GoogleGenAI,
        messageParams: any,
        history: any[] = [],
        verbose: boolean = false
    ) {
        this.name = name;
        this.system = system;
        this.tools = tools;
        this.mcpServers = mcpServers;
        this.config = config;
        this.client = client;
        this.messageParams = messageParams;
        this.history = history;
        this.verbose = verbose;
    }
}