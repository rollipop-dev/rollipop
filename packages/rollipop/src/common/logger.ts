import chalk, { type ChalkInstance } from 'chalk';
import dayjs from 'dayjs';
import { invariant } from 'es-toolkit';

import { isDebugEnabled } from './env';

export type LogLevel = 'trace' | 'debug' | 'log' | 'info' | 'warn' | 'error';
export interface LoggerOptions {
  forcePrint?: boolean;
}

export class Logger {
  private static blocked = false;
  private static queuedMessages: unknown[][] = [];

  static Colors = {
    trace: chalk.gray,
    debug: chalk.blue,
    log: chalk.green,
    info: chalk.cyan,
    warn: chalk.yellow,
    error: chalk.red,
  } satisfies Record<LogLevel, ChalkInstance>;

  private format: string = 'HH:mm:ss.SSS';
  private debugEnabled: boolean;

  static block() {
    this.blocked = true;
  }

  static unblock(flush = true) {
    this.blocked = false;
    if (flush) {
      for (const args of Logger.queuedMessages) {
        console.log(...args);
      }
    }
    Logger.queuedMessages.length = 0;
  }

  constructor(
    private readonly scope?: string,
    private readonly options?: LoggerOptions,
  ) {
    this.debugEnabled = isDebugEnabled();
  }

  getFormat() {
    return this.format;
  }

  setFormat(format: string) {
    this.format = format;
  }

  private getTimestamp() {
    return dayjs().format(this.getFormat());
  }

  private print(logLevel: LogLevel, ...args: unknown[]) {
    const timestamp = chalk.gray(this.getTimestamp());
    const level = Logger.Colors[logLevel](logLevel);

    if (this.scope) {
      const scope = chalk.magenta(this.scope);
      args = [timestamp, level, scope, ...args];
    } else {
      args = [timestamp, level, ...args];
    }

    if (Logger.blocked) {
      Logger.queuedMessages.push(args);
    } else {
      console.log(...args);
    }
  }

  trace(...args: unknown[]) {
    // oxlint-disable-next-line no-unused-expressions
    (this.options?.forcePrint || this.debugEnabled) && this.print('trace', ...args);
  }

  debug(...args: unknown[]) {
    // oxlint-disable-next-line no-unused-expressions
    (this.options?.forcePrint || this.debugEnabled) && this.print('debug', ...args);
  }

  log(...args: unknown[]) {
    this.print('log', ...args);
  }

  info(...args: unknown[]) {
    this.print('info', ...args);
  }

  warn(...args: unknown[]) {
    this.print('warn', ...args);
  }

  error(...args: unknown[]) {
    this.print('error', ...args);
  }

  child(scope: string) {
    invariant(this.scope, 'Logger must have a scope to create a child logger');
    return new Logger(`${this.scope}:${scope}`);
  }
}
