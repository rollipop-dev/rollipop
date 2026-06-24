import type { BuildDiagnosticLog } from '../../types';
import type { ServerEventBus } from '../events/event-bus';
import type { ServerEvent } from '../events/types';

export type BuildStateStatus = 'pending' | 'success' | 'failed';
export type BuildStateLogLevel = 'info' | 'warn' | 'error';

export interface BuildStateMessages {
  info: number;
  warn: number;
  error: number;
}

export interface BuildStateLog {
  id: string;
  level: BuildStateLogLevel;
  source: string;
  message: string;
  timestamp: string;
}

export interface BuildState {
  id: string;
  bundlerId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: BuildStateStatus;
  messages: BuildStateMessages;
}

interface StoredBuild extends BuildState {
  logs: BuildStateLog[];
}

const MAX_BUILD_LOGS = 1000;

export interface DevServerStateOptions {
  eventBus: ServerEventBus;
}

export class DevServerState {
  readonly startedAt = new Date();
  private readonly builds = new BuildStore();

  constructor({ eventBus }: DevServerStateOptions) {
    eventBus.subscribe((event) => this.handleEvent(event));
  }

  get uptimeMs(): number {
    return Date.now() - this.startedAt.getTime();
  }

  getBuilds(): BuildState[] {
    return this.builds.getBuilds();
  }

  getBuild(id: string): BuildState | undefined {
    return this.builds.getBuild(id);
  }

  getBuildLogs(id: string): BuildStateLog[] | undefined {
    return this.builds.getBuildLogs(id);
  }

  clearBuildLogs(id: string): boolean {
    return this.builds.clearBuildLogs(id);
  }

  clearBuilds(): void {
    this.builds.clear();
  }

  resetBufferedState(): void {
    this.clearBuilds();
  }

  private handleEvent(event: ServerEvent): void {
    this.builds.handleEvent(event);
  }
}

class BuildStore {
  private readonly buildsByBundlerId = new Map<string, StoredBuild>();
  private readonly pendingStartedAt = new Map<string, string>();
  private order: string[] = [];
  private nextLogId = 0;

  handleEvent(event: ServerEvent): void {
    if (!('bundlerId' in event)) {
      return;
    }

    switch (event.type) {
      case 'bundle_build_started':
        this.startBuild(event.bundlerId);
        break;

      case 'bundle_build_done':
        this.finishBuild(event.bundlerId, 'success', event.duration);
        break;

      case 'bundle_build_failed':
        this.finishBuild(event.bundlerId, 'failed', undefined, event.error);
        break;

      case 'build_log':
      case 'build_error':
        this.appendBuildLog(event.bundlerId, event.level, event.log);
        break;
    }
  }

  getBuilds(): BuildState[] {
    return this.order.flatMap((bundlerId) => {
      const build = this.buildsByBundlerId.get(bundlerId);
      if (build == null) {
        return [];
      }

      const { logs: _logs, ...summary } = build;

      return [
        {
          ...summary,
          messages: { ...summary.messages },
        },
      ];
    });
  }

  getBuild(id: string): BuildState | undefined {
    return this.getBuilds().find((build) => build.id === id || build.bundlerId === id);
  }

  getBuildLogs(id: string): BuildStateLog[] | undefined {
    const build = this.buildsByBundlerId.get(id) ?? this.findBuildById(id);

    return build?.logs.map((log) => ({ ...log }));
  }

  clearBuildLogs(id: string): boolean {
    const build = this.buildsByBundlerId.get(id) ?? this.findBuildById(id);
    if (build == null) {
      return false;
    }

    build.logs = [];
    build.messages = createEmptyMessages();
    return true;
  }

  clear(): void {
    this.buildsByBundlerId.clear();
    this.pendingStartedAt.clear();
    this.order = [];
  }

  private startBuild(bundlerId: string): void {
    const startedAt = new Date();
    const build = this.getOrCreateBuild(bundlerId, startedAt);

    build.startedAt = startedAt.toISOString();
    build.endedAt = null;
    build.durationMs = null;
    build.status = 'pending';
    this.pendingStartedAt.set(bundlerId, build.startedAt);
    this.moveToFront(bundlerId);
    this.appendLog(build, 'info', 'rollipop', 'Build started.');
  }

  private finishBuild(
    bundlerId: string,
    status: Exclude<BuildStateStatus, 'pending'>,
    durationMs?: number,
    error?: Error,
  ): void {
    const endedAt = new Date();
    const build = this.getOrCreateBuild(bundlerId, endedAt);
    const startedAt = this.pendingStartedAt.get(bundlerId) ?? build.startedAt;
    const resolvedDurationMs =
      durationMs ?? Math.max(0, endedAt.getTime() - new Date(startedAt).getTime());

    build.status = status;
    build.startedAt = startedAt;
    build.endedAt = endedAt.toISOString();
    build.durationMs = resolvedDurationMs;
    this.pendingStartedAt.delete(bundlerId);
    this.moveToFront(bundlerId);

    if (status === 'success') {
      this.appendLog(
        build,
        'info',
        'rollipop',
        `Build completed in ${resolvedDurationMs.toFixed(2)}ms.`,
      );
      return;
    }

    this.appendLog(
      build,
      'error',
      'rollipop',
      `Build failed${error == null ? '.' : `: ${error.message}`}`,
    );
  }

  private appendBuildLog(
    bundlerId: string,
    level: 'debug' | 'info' | 'warn' | 'error',
    diagnostic: BuildDiagnosticLog,
  ): void {
    if (level === 'debug') {
      return;
    }

    const build = this.getOrCreateBuild(bundlerId, new Date());
    this.appendLog(
      build,
      level,
      diagnostic.plugin ?? diagnostic.hook ?? diagnostic.code ?? 'build',
      diagnostic.message,
    );
  }

  private getOrCreateBuild(bundlerId: string, createdAt: Date): StoredBuild {
    const existing = this.buildsByBundlerId.get(bundlerId);
    if (existing != null) {
      return existing;
    }

    const build: StoredBuild = {
      id: bundlerId,
      bundlerId,
      startedAt: createdAt.toISOString(),
      endedAt: null,
      durationMs: null,
      status: 'pending',
      messages: createEmptyMessages(),
      logs: [],
    };

    this.buildsByBundlerId.set(bundlerId, build);
    this.order.unshift(bundlerId);

    return build;
  }

  private findBuildById(id: string): StoredBuild | undefined {
    return Array.from(this.buildsByBundlerId.values()).find((build) => build.id === id);
  }

  private moveToFront(bundlerId: string): void {
    this.order = [bundlerId, ...this.order.filter((item) => item !== bundlerId)];
  }

  private appendLog(
    build: StoredBuild,
    level: BuildStateLogLevel,
    source: string,
    message: string,
  ): void {
    build.messages[level] += 1;
    build.logs.push({
      id: `log-${++this.nextLogId}`,
      level,
      source,
      message,
      timestamp: new Date().toISOString(),
    });

    if (build.logs.length > MAX_BUILD_LOGS) {
      const removed = build.logs.shift();
      if (removed != null) {
        build.messages[removed.level] = Math.max(0, build.messages[removed.level] - 1);
      }
    }
  }
}

function createEmptyMessages(): BuildStateMessages {
  return {
    info: 0,
    warn: 0,
    error: 0,
  };
}
