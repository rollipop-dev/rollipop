import type { DevServerContext } from '../../types';

export interface AppLogEntry {
  id: number;
  timestamp: string;
  source: 'client_log';
  level: string;
  args: unknown[];
  bundlerId?: string;
}

const MAX_DIAGNOSTIC_ENTRIES = 500;

export class AppLogDiagnostics {
  private logs: AppLogEntry[] = [];
  private nextLogId = 0;

  constructor(context: DevServerContext) {
    context.eventBus.subscribe((event) => {
      if (event.type !== 'client_log') {
        return;
      }

      this.logs.push({
        id: ++this.nextLogId,
        timestamp: new Date().toISOString(),
        source: 'client_log',
        level: event.level,
        args: event.data,
        ...(event.bundlerId != null ? { bundlerId: event.bundlerId } : {}),
      });
      trimArray(this.logs, MAX_DIAGNOSTIC_ENTRIES);
    });
  }

  getConsoleLogs(options?: { limit?: number; bundlerId?: string }): AppLogEntry[] {
    return filterByBundlerId(this.logs, options?.bundlerId).slice(-(options?.limit ?? 100));
  }

  clearConsoleLogs(options?: { bundlerId?: string }): void {
    this.logs = filterOutBundlerId(this.logs, options?.bundlerId);
  }
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
