import path from 'node:path';

import chalk from 'chalk';

import { Logger } from '../common/logger';
import { ProgressBar, ProgressBarRenderManager } from '../common/progress-bar';
import { logger } from '../logger';
import type { ReportableEvent, Reporter } from '../types';

export class ClientLogReporter implements Reporter {
  private logger = new Logger('app');

  update(event: ReportableEvent): void {
    if (event.type === 'client_log') {
      if (event.level === 'group' || event.level === 'groupCollapsed') {
        this.logger.info(...event.data);
        return;
      } else if (event.level === 'groupEnd') {
        return;
      }
      this.logger[event.level](...event.data);
    }
  }
}

enum ProgressFlags {
  NONE = 0b0000,
  BUILD_IN_PROGRESS = 0b0001,
  FILE_CHANGED = 0b0010,
}

export class ProgressBarStatusReporter implements Reporter {
  private renderManager = ProgressBarRenderManager.getInstance();
  private progressBar: ProgressBar;
  private flags = ProgressFlags.NONE;
  private progressVisible = false;
  private lastBuildTotalModules: number;
  private hmrUpdateCount = 0;

  constructor(
    private readonly root: string,
    id: string,
    label: string,
    initialTotalModules: number,
  ) {
    this.lastBuildTotalModules = initialTotalModules;
    this.progressBar = this.renderManager.register(id, {
      label,
      total: initialTotalModules,
    });
  }

  private renderProgress(id: string, totalModules: number | undefined, transformedModules: number) {
    const isHmrProgress =
      (this.flags & ProgressFlags.BUILD_IN_PROGRESS) === 0 &&
      (this.flags & ProgressFlags.FILE_CHANGED) !== 0;

    if (isHmrProgress) {
      this.progressBar.setCurrent(0).setTotal(0).start();
    }

    const shouldStartProgress = !this.progressVisible;
    if (shouldStartProgress) {
      this.progressVisible = true;
    }

    if (totalModules != null) {
      this.progressBar.setTotal(totalModules);
    }
    const displayId = this.getDisplayPath(id);
    this.progressBar.setCurrent(transformedModules).setModuleId(displayId);

    if (shouldStartProgress) {
      this.renderManager.start();
    } else {
      this.renderManager.render();
    }
  }

  private finishHmr() {
    const shouldStartProgress = !this.progressVisible;
    this.flags = ProgressFlags.NONE;
    this.progressVisible = true;

    if (shouldStartProgress) {
      this.renderManager.start();
    } else {
      this.renderManager.render();
    }

    this.renderManager.release();
    this.progressVisible = false;
  }

  private getCompletedBuildCurrent(event: Extract<ReportableEvent, { type: 'bundle_build_done' }>) {
    const processedModules = event.transformedModules + event.cacheHitModules;
    return processedModules === 0 && event.totalModules > 0 ? event.totalModules : processedModules;
  }

  private getDisplayPath(id: string) {
    const relativePath = path.relative(this.root, id);
    if (relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
      return relativePath;
    }
    return id;
  }

  update(event: ReportableEvent): void {
    switch (event.type) {
      case 'bundle_build_started':
        this.progressBar.setCurrent(0).setTotal(this.lastBuildTotalModules);
        this.flags |= ProgressFlags.BUILD_IN_PROGRESS;
        this.progressBar.start();
        if ((this.flags & ProgressFlags.FILE_CHANGED) !== 0) {
          this.progressVisible = true;
          this.renderManager.start();
        }
        break;

      case 'bundle_build_failed':
        this.flags = ProgressFlags.NONE;
        this.progressBar.complete(0, true);
        this.renderManager.release();
        this.progressVisible = false;
        break;

      case 'bundle_build_done':
        this.flags = ProgressFlags.NONE;
        this.lastBuildTotalModules = event.totalModules;
        this.progressBar
          .setCurrent(this.getCompletedBuildCurrent(event))
          .setTotal(event.totalModules)
          .complete(event.duration, false);
        this.renderManager.release();
        this.progressVisible = false;
        break;

      case 'transform':
        const { id, totalModules, transformedModules } = event;
        this.renderProgress(id, totalModules, transformedModules);
        break;

      case 'watch_change':
        this.flags |= ProgressFlags.FILE_CHANGED;
        break;

      case 'hmr_updates':
        this.hmrUpdateCount++;
        this.progressBar.completeHmr(
          event.changedFiles.map((id) => this.getDisplayPath(id)),
          this.hmrUpdateCount,
        );
        this.finishHmr();
        break;

      case 'hmr_failed':
        this.progressBar.failHmr();
        this.finishHmr();
        break;
    }
  }
}

export class CompatStatusReporter implements Reporter {
  update(event: ReportableEvent): void {
    switch (event.type) {
      case 'bundle_build_started':
        logger.info('Build started...');
        break;

      case 'bundle_build_failed':
        logger.error(`Build failed`);
        break;

      case 'bundle_build_done':
        const { duration, totalModules } = event;
        const time = chalk.blue(`${duration.toFixed(2)}ms`);
        const modules = chalk.blue(`(${totalModules} modules)`);
        logger.info(`Build completed in ${time} ${modules}`);
        break;
    }
  }
}
