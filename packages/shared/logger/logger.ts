import fs from 'node:fs';
import path from 'node:path';
import boxen from 'boxen';
import chalk from 'chalk';
import winston from 'winston';
import { env } from '../env.ts';

// ===== 1.Foundation Layer: Winston Configuration =====
const logLevels = {
  error: 0, // Highest priority
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6, // Lowest priority
};

// ===== 2. Security Layer: Data Redaction =====

const SENTITIVE_KEYS = ['apiKey', 'password', 'secret', 'token', 'auth', 'key', 'credential'];
const MASK_REGEX = new RegExp(`(${SENTITIVE_KEYS.join('|')})("']?\\s*[:=]\\s*)(["'])?.*?\\3`, 'gi');

const redactSensitiveData = (message: string) => {
  const shouldRedact = env.REDACT_SECRETS !== false;
  if (!shouldRedact) return message;

  return message.replace(MASK_REGEX, (_match, key, separator, quote) => {
    const quoteMark = quote || '';
    return `${key}${separator}${quoteMark}***REDACTED***${quoteMark}`;
  });
};

// ===== 3. Visual Formatting Layer =====

type ChalkColor =
  | 'red'
  | 'green'
  | 'yellow'
  | 'blue'
  | 'magenta'
  | 'cyan'
  | 'white'
  | 'gray'
  | 'redBright'
  | 'greenBright'
  | 'yellowBright'
  | 'blueBright'
  | 'magentaBright'
  | 'cyanBright'
  | 'whiteBright';

const levelColorMap: Record<string, (text: string) => string> = {
  error: chalk.red,
  warn: chalk.yellow,
  info: chalk.blue,
  http: chalk.cyan,
  verbose: chalk.magenta,
  debug: chalk.gray,
  silly: chalk.gray.dim,
};

// Create custom format for masking
const maskFormat = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = redactSensitiveData(info.message);
  }
  return info;
});

const consoleFormat = winston.format.printf(({ level, message, timestamp, color }) => {
  const colorize = levelColorMap[level] || chalk.white;
  let formattedMessage = message;

  // Apply custom color if specified
  if (color && chalk[color as ChalkColor]) {
    formattedMessage = (chalk[color as ChalkColor] as (text: string) => string)(message as string);
  }

  return `${chalk.dim(timestamp)} ${colorize(level.toUpperCase())}: ${formattedMessage}`;
});

// File formatting (no colors)
const fileFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}] : ${message}`;
});

// ===== 4. Configuration Layer =====

const getDefaultLogLevel = (): string => {
  const envLevel = env.LOG_LEVEL;
  if (envLevel && Object.keys(logLevels).includes(envLevel.toLowerCase())) {
    return envLevel.toLowerCase();
  }
  return 'info';
};

// ===== 5. Logger Interface =====

export interface LoggerOptions {
  level?: string;
  silent?: boolean;
  file?: string;
}

// ===== 6. Core Logger Class =====

export class Logger {
  private logger: winston.Logger;
  private isSilent: boolean;

  constructor(options: LoggerOptions = {}) {
    const level = options.level || getDefaultLogLevel();
    this.isSilent = options.silent || false;

    const errorFormat = winston.format((info) => {
      if (info instanceof Error) {
        return Object.assign({}, info, {
          message: info.message,
          stack: info.stack,
        });
      }
      if (info.error instanceof Error) {
        info.message = `\n${info.error.stack}`;
      }
      return info;
    });

    // create the winston logger
    this.logger = winston.createLogger({
      levels: logLevels,
      level: level,
      format: winston.format.combine(
        errorFormat(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        maskFormat(),
      ),
      transports: this.createTransports(options.file),
      silent: this.isSilent,
    });

    // add colors to winston
    winston.addColors({
      error: 'red',
      warn: 'yellow',
      info: 'blue',
      http: 'cyan',
      verbose: 'magenta',
      debug: 'gray',
      silly: 'gray.dim',
    });
  }

  private createTransports(filePath?: string): winston.transport[] {
    const transports: winston.transport[] = [];

    if (filePath) {
      // File transport
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      transports.push(
        new winston.transports.File({
          filename: filePath,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            maskFormat(),
            fileFormat,
          ),
        }),
      );
    } else {
      // Console transport
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            maskFormat(),
            consoleFormat,
          ),
        }),
      );
    }
    return transports;
  }

  // ===== Core Logging Methods =====
  error(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.error(message, { ...meta, color });
  }

  warn(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.warn(message, { ...meta, color });
  }

  info(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.info(message, { ...meta, color });
  }

  http(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.http(message, { ...meta, color });
  }

  debug(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.debug(message, { ...meta, color });
  }

  silly(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.silly(message, { ...meta, color });
  }

  verbose(message: string, meta?: Record<string, unknown>, color?: ChalkColor) {
    this.logger.verbose(message, { ...meta, color });
  }

  // ===== Specilized Display Methods =====

  displayAIResponse(response: Record<string, unknown>): void {
    if (this.isSilent) return;

    const content =
      typeof response === 'string'
        ? response
        : response?.content || JSON.stringify(response, null, 2);

    console.log(
      boxen(chalk.white(content), {
        padding: 1,
        borderColor: 'yellow',
        title: 'AI Response',
        titleAlignment: 'center',
      }),
    );
  }
  displayBox(title: string, content: string, borderColor: ChalkColor = 'white'): void {
    if (this.isSilent) return;

    console.log(
      boxen(content, {
        padding: 1,
        borderColor: borderColor,
        title: title,
        titleAlignment: 'center',
      }),
    );
  }

  // ===== Runtime Configuration Management =====

  setLevel(level: string): void {
    if (Object.keys(logLevels).includes(level.toLowerCase())) {
      this.logger.level = level.toLowerCase();
      if (!this.isSilent) {
        console.log(`Log level set to: ${level}`);
      }
    } else {
      this.error(
        `Invalid log level: ${level}. Valid levels: ${Object.keys(logLevels).join(', ')}.`,
      );
    }
  }

  getLevel(): string {
    return this.logger.level;
  }

  setSilent(silent: boolean): void {
    this.isSilent = silent;
    this.logger.silent = silent;
  }

  redirectToFile(filePath: string): void {
    try {
      // Ensure directory exists
      fs.mkdirSync(path.dirname(filePath), { recursive: true });

      // Clear existing transports
      this.logger.clear();

      // Add file transport
      this.logger.add(
        new winston.transports.File({
          filename: filePath,
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            maskFormat(),
            fileFormat,
          ),
        }),
      );
    } catch (error) {
      this.error(`Failed to redirect logger to file: ${error}`);
    }
  }

  redirectToConsole(): void {
    try {
      // Clear existing transports
      this.logger.clear();

      // Add console transport
      this.logger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            maskFormat(),
            consoleFormat,
          ),
        }),
      );
    } catch (error) {
      this.error(`Failed to redirect logger to console: ${error}`);
    }
  }

  // ===== Utility Methods =====

  createChild(options: LoggerOptions = {}): Logger {
    const childOptions: LoggerOptions = {
      level: options.level || this.getLevel(),
      silent: options.silent !== undefined ? options.silent : this.isSilent,
    };

    // Only include file option if it's defined
    if (options.file !== undefined) {
      childOptions.file = options.file;
    }
    return new Logger(childOptions);
  }

  // Get logger instance for advanced usage
  getWinstonLogger(): winston.Logger {
    return this.logger;
  }
}

// ===== 8. Singleton Pattern =====

export const logger = new Logger();

// ===== Export Types =====

export type { ChalkColor };

// ===== Utility Functions =====

export const createLogger = (options: LoggerOptions = {}): Logger => {
  return new Logger(options);
};

export const setGlobalLogLevel = (level: string): void => {
  logger.setLevel(level);
};

export const getGlobalLogLevel = (): string => {
  return logger.getLevel();
};
