import type { BuildDiagnosticLog } from '../../../types';
import type { DevServerContext } from '../../types';

export interface BuildLogEntry {
  id: number;
  timestamp: string;
  source: 'rolldown';
  level: 'debug' | 'info';
  bundlerId?: string;
  log: BuildDiagnosticLog;
}

export interface BuildErrorEntry {
  id: number;
  timestamp: string;
  source: 'rolldown' | 'build';
  level: 'warn' | 'error';
  bundlerId?: string;
  log?: BuildDiagnosticLog;
  error?: SerializedError;
}

interface SerializedError {
  name?: string;
  message: string;
  stack?: string;
}

const MAX_DIAGNOSTIC_ENTRIES = 500;

export class BuildDiagnostics {
  private buildLogs: BuildLogEntry[] = [];
  private buildErrors: BuildErrorEntry[] = [];
  private nextBuildLogId = 0;
  private nextBuildErrorId = 0;

  constructor(context: DevServerContext) {
    context.eventBus.subscribe((event) => {
      switch (event.type) {
        case 'build_log':
          this.pushBuildLog({
            source: 'rolldown',
            level: event.level,
            bundlerId: event.bundlerId,
            log: event.log,
          });
          break;

        case 'build_error':
          this.pushBuildError({
            source: 'rolldown',
            level: event.level,
            bundlerId: event.bundlerId,
            log: event.log,
          });
          break;

        case 'bundle_build_failed':
          this.pushBuildError({
            source: 'build',
            level: 'error',
            bundlerId: event.bundlerId,
            error: serializeError(event.error),
          });
          break;
      }
    });
  }

  getBuildLogs(options?: { limit?: number; bundlerId?: string }): BuildLogEntry[] {
    return filterByBundlerId(this.buildLogs, options?.bundlerId).slice(-(options?.limit ?? 100));
  }

  getBuildErrors(options?: { limit?: number; bundlerId?: string }): BuildErrorEntry[] {
    return filterByBundlerId(this.buildErrors, options?.bundlerId).slice(-(options?.limit ?? 100));
  }

  clearBuildLogs(options?: { bundlerId?: string }): void {
    this.buildLogs = filterOutBundlerId(this.buildLogs, options?.bundlerId);
  }

  clearBuildErrors(options?: { bundlerId?: string }): void {
    this.buildErrors = filterOutBundlerId(this.buildErrors, options?.bundlerId);
  }

  clearBuildDiagnostics(options?: { bundlerId?: string }): void {
    this.clearBuildLogs(options);
    this.clearBuildErrors(options);
  }

  private pushBuildLog(log: Omit<BuildLogEntry, 'id' | 'timestamp'>) {
    this.buildLogs.push({
      id: ++this.nextBuildLogId,
      timestamp: new Date().toISOString(),
      ...log,
    });
    trimArray(this.buildLogs, MAX_DIAGNOSTIC_ENTRIES);
  }

  private pushBuildError(error: Omit<BuildErrorEntry, 'id' | 'timestamp'>) {
    this.buildErrors.push({
      id: ++this.nextBuildErrorId,
      timestamp: new Date().toISOString(),
      ...error,
    });
    trimArray(this.buildErrors, MAX_DIAGNOSTIC_ENTRIES);
  }
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function trimArray<T>(entries: T[], maxEntries: number): void {
  if (entries.length > maxEntries) {
    entries.splice(0, entries.length - maxEntries);
  }
}

function filterByBundlerId<T extends { bundlerId?: string }>(entries: T[], bundlerId?: string) {
  return bundlerId == null ? entries : entries.filter((entry) => entry.bundlerId === bundlerId);
}

function filterOutBundlerId<T extends { bundlerId?: string }>(entries: T[], bundlerId?: string) {
  return bundlerId == null ? [] : entries.filter((entry) => entry.bundlerId !== bundlerId);
}
