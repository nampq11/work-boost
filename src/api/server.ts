import { Agent } from "../services/agent/main.ts";
import * as http from "node:http"
import express, { Application, Request, Response, NextFunction } from "express";
import { logger } from "../core/logger/logger.ts";
import { requestIdMiddleware, requestLoggingMiddleware, errorLoggingMiddleware } from "./middleware/logging.ts";
import { ERROR_CODES, successResponse, errorResponse } from "./utils/response.ts";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createMessageRouters } from "./routes/message.ts";

export interface ApiServerConfig {
    port: number;
    host?: string;
    corsOrigins?: string[];
    rateLimitWindowMs?: number;
    rateLimitMaxRequests?: number;
    enableWebSocket?: boolean;
    apiPrefix?: string;
}

export class ApiServer {
  private app: Application;
  private agent: Agent;
  private config: ApiServerConfig;
  private apiPrefix: string;

  // WebSocket components
  private httpServer: http.Server;
  private wss?: WebSocket;
//   private wsConnectionManager?: WebSocketConnectionManager;
//   private wsMessageRouter?: WebSocketMessage
//   private wsEventSubscriber?: WebSocketEventSubscriber;
//   private heartbeatInterval?: NodeJS.Timeout;

    constructor(agent: Agent, config: ApiServerConfig) {
        this.agent = agent;
        this.config = config;

        this.apiPrefix = this.validateAndNormalizeApiPrefix(config.apiPrefix);
        
        this.app = express();
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();

        // Note: MCP setup is now handled in start() method to properly handle async operations
    }

    private validateAndNormalizeApiPrefix(prefix?: string): string {
        if (prefix === undefined) return "/api";
        
        if (prefix === '') return '';

        if (typeof prefix !== 'string') {
            throw new Error('API prefix must be a string');
        }

        if (prefix.startsWith('/') && prefix !== '/') {
            prefix = prefix.slice(0, -1);
        }
        logger.info(`[API Server] Using API prefix: ${prefix} || '(None)'`);
        return prefix;
    }

    private buildAPIRouter(route: string): string {
        if (!this.apiPrefix || this.apiPrefix === '') return route;

        return `${this.apiPrefix}${route}`;
    }

    private buildFullPath(req: Request, path: string): string {
        const contextPath = (req as any).contextPath || '';
        const fullPath = contextPath + this.buildAPIRouter(path);
        
        logger.info(`[API Server] Built full path:`, {
            path,
            contextPath,
            apiPrefix: this.apiPrefix,
            fullPath,
        })
        return fullPath;
    }

    private setupMiddleware(): void {
        // Enable trust proxy for reverse proxy support
        this.app.set('trust proxy', true);

        // Parse X-Forwarded-Prefix for context path support
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            // Get the prefix from the X-Forwarded-Prefix header or enviroment variable
            const forwardedPrefix = req.headers['x-forwarded-prefix'] as string;
            const envPrefix = process.env.PROXY_CONTEXT_PATH;
            const contextPath = forwardedPrefix || envPrefix || '';

            // Store context path on request for later use
            (req as any).contextPath = contextPath;

            logger.debug('[API Server] Request context', {
                originalUrl: req.originalUrl,
                contextPath,
                forwardedPrefix,
                forwardedProto: req.headers['x-forwarded-proto'],
                forwardedHost: req.headers['x-forwarded-host']           
            });

            next();
        });

        // Security middleware
        this.app.use(
            helmet({
                contentSecurityPolicy: false, // Disable CSP for API
                crossOriginEmbedderPolicy: false,
            })
        );

        // CORS configuration - enhanced for reverse proxy support
        this.app.use(
            cors({
                origin: (origin: any, callback: any) => {
                    const allowedOrigins = this.config.corsOrigins || ['http://localhost:3000'];

                    // Allow requests with no origin (e.g., mobile apps, curl, Postman)
                    if (!origin) {
                        callback(null, true);
                        return;
                    }

                    // Check if origin is in the allowed list
                    if (allowedOrigins.includes(origin)) {
                        callback(null, true);
                        return;
                    }

                    // Additional lenient check for development environments only
                    // Allow localhost and 127.0.0.1 with any port in development
                    if (process.env.NODE_ENV !== 'production') {
                        const originUrl = new URL(origin);
                        if (
                            originUrl.hostname === 'localhost' ||
                            originUrl.hostname === '127.0.0.1' ||
                            originUrl.hostname === '::1'
                        ) {
                            callback(null, true);
                            return;
                        }
                    };

                    // Reject all other origins
                    callback(new Error(`Not allowed by CORS`));
                },
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Session-ID'],
                credentials: true,
            })
        );

        // Rate limiting
        const limiter = rateLimit({
            windowMs: this.config.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
            max: this.config.rateLimitMaxRequests || 100, // limit each IP to 100 requests per windowMs
            message: {
                sucess: false,
                error: {
                    code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
                    message: `Too many request from this IP, please try again later.`,
                },
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        // Apply rate limiting to API routes if prefix is configured
        if (this.apiPrefix) {
            this.app.use(`${this.apiPrefix}`, limiter);
        }

        // Body parsing middleware
        this.app.use(express.json({ limit: '10mb'})); // support for image data
        this.app.use(express.urlencoded({ extended: true }));

        // Custom middleware
        this.app.use(requestIdMiddleware);
        this.app.use(requestLoggingMiddleware);
    }

    private setupRoutes(): void {
        // Health check endpoint
        this.app.get('health', (_req: Request, res: Response) => {
            const healthData: any = {
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                version: process.env.VERSION || 'unknown',
            };

            // TODO: Add Websocket health if enabled

            res.json(healthData);
        })

        // TODO: WebSocket stats endpoint

        // API routes
        this.app.use(this.buildAPIRouter('/message'), createMessageRouters(this.agent));

        // TODO: Legacy endpoint for MCP server connection

        // Chrome DevTools compatibility endpoint (prevents 404 errors in console)
        this.app.get(
            '/.well-known/appspecific/com.chrome.devtools.json',
            (req: Request, res: Response) => {
                res.status(204).end(); // No content - indicates no DevTools integration available
            }
        );

        // Global reset endpoint
        this.app.post(this.buildAPIRouter('/reset'), async (req: Request, res: Response) => {
            try {
                const { sessionId } = req.body;

                logger.info('Processing global reset request', {
                    requestId: req.requestId,
                    sessionId: sessionId || 'all',
                });

                if (sessionId) {
                    // Reset specific session
                    const success = await this.agent.removeSession(sessionId);
                    if (!success) {
                        return errorResponse(
                            res,
                            ERROR_CODES.SESSION_NOT_FOUND,
                            `Session ${sessionId} not found`,
                            404,
                            undefined,
                            req.requestId
                        );
                    }
                } else {
                    // Reset all sessions
                    const sessionIds = await this.agent.listSessions();
                    for (const id of sessionIds) {
                        await this.agent.removeSession(id);
                    }
                }

                successResponse(
                    res,
                    {
                        message: sessionId ? `Session ${sessionId} reset`: 'All sessions reset',
                        timestamp: new Date().toISOString(),
                    },
                    200,
                    req.requestId
                );
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                logger.error('Global reset failed', {
                    requestId: req.requestId,
                    error: errorMsg,
                });

                errorResponse(
                    res,
                    ERROR_CODES.INTERNAL_ERROR,
                    `Reset failed: ${errorMsg}`,
                    500,
                    process.env.NODE_ENV === 'development' ? error: undefined,
                    req.requestId
                );
            }
        });
    }

    private setup404Handler(): void {
        // 404 handler for unknown routes - must me registered AFTER all other routes
        this.app.use((req: Request, res: Response) => {
            errorResponse(
                res,
                ERROR_CODES.NOT_FOUND,
                `Route ${req.method} ${req.originalUrl} not found`,
                404,
                undefined,
                req.requestId
            );
        });
    }

    private setupErrorHandling(): void {
        // Error logging middleware
        this.app.use(errorLoggingMiddleware);

        // Global error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            // If response already sent, delegate to default error handler
            if (res.headersSent) {
                return next(err);
            }

            // Determine error type and status code
            let statusCode = 500;
            let errorCode: string = ERROR_CODES.INTERNAL_ERROR;

            if (err.name === 'ValidationError') {
                statusCode = 400;
                errorCode = ERROR_CODES.VALIDATION_ERROR;
            } else if (err.name === 'UnauthorizedError') {
                statusCode = 401;
                errorCode = ERROR_CODES.UNAUTHORIZED;
            }

            errorResponse(
                res, 
                errorCode,
                err.message || 'An unexpected error occurred',
                statusCode,
                process.env.NODE_ENV === 'development' ? err.stack : undefined,
                req.requestId
            );
        });
    }
}
