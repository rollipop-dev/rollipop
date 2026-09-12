import { select } from '@inquirer/prompts';
import { toMerged } from 'es-toolkit';

import { Logger } from '../../../common/logger';
import { loadSettings, saveSettings, type Settings } from '../../../core/settings';
import { logger } from '../../logger';

export interface PageDescription {
  id: string;
  title: string;
  description: string;
}

export class DebuggerOpener {
  static readonly MAX_TARGETS_SHOWN = 10;

  private _prompting = false;
  private settings: Settings;
  private autoOpened = false;

  static setAutoOpenEnabled(projectRoot: string, enabled: boolean) {
    saveSettings(projectRoot, { devtools: { autoOpen: enabled } });
  }

  constructor(
    private readonly projectRoot: string,
    private readonly serverUrl: string,
  ) {
    this.settings = loadSettings(projectRoot);
  }

  private async openDebuggerForTarget(target: PageDescription) {
    logger.debug(`Opening debugger for target: ${target.id}`);

    try {
      await fetch(
        new URL('/open-debugger?target=' + encodeURIComponent(target.id), this.serverUrl),
        { method: 'POST' },
      );
    } catch (error) {
      logger.error(`Failed to open debugger for ${target.title}`);
      logger.debug('Reason', error);
    }
  }

  async autoOpen() {
    if (this.autoOpened) {
      return;
    }

    this.autoOpened = true;

    if (this.isAutoOpenEnabled()) {
      await this.open();
    }
  }

  async open() {
    logger.debug('Fetching available debugging targets...');

    const response = await fetch(new URL('/json/list', this.serverUrl), {
      method: 'POST',
    });

    if (response.status !== 200) {
      throw new Error(`Unexpected status code: ${response.status}`);
    }

    const targets = (await response.json()) as PageDescription[];

    if (!Array.isArray(targets)) {
      throw new Error('Unexpected response format');
    }

    logger.debug(`Found ${targets.length} debugging targets:`);

    if (targets.length === 0) {
      logger.warn('No connected targets');
    } else if (targets.length === 1) {
      const target = targets[0];
      await this.openDebuggerForTarget(target);
    } else {
      if (targets.length > DebuggerOpener.MAX_TARGETS_SHOWN) {
        logger.warn(
          `More than ${DebuggerOpener.MAX_TARGETS_SHOWN} debug targets available, showing the first ${DebuggerOpener.MAX_TARGETS_SHOWN}.`,
        );
      }

      const slicedTargets = targets.slice(0, DebuggerOpener.MAX_TARGETS_SHOWN);

      // Blocking the logger to prevent flickering
      Logger.block();
      this._prompting = true;

      try {
        const targetIndex = await select({
          message: 'Multiple debug targets available, please select:',
          choices: slicedTargets.map((target, index) => ({
            value: index,
            name: `${target.title} (${target.description})`,
          })),
        });
        await this.openDebuggerForTarget(slicedTargets[targetIndex]);
      } catch {
        // noop
      } finally {
        Logger.unblock();
        this._prompting = false;
      }
    }
  }

  isPrompting() {
    return this._prompting;
  }

  isAutoOpenEnabled() {
    return this.settings.devtools?.autoOpen ?? false;
  }

  setAutoOpenEnabled(enabled: boolean) {
    const newSettings = (this.settings = toMerged(this.settings, {
      devtools: { autoOpen: enabled },
    }));
    saveSettings(this.projectRoot, newSettings);
  }
}
