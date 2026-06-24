import readline from 'node:readline';
import { ReadStream } from 'node:tty';

import chalk from 'chalk';
import { throttle } from 'es-toolkit';

import type { Logger } from '../../../common/logger';
import type { DevServer } from '../../../server';
import { logger } from '../../logger';
import { DebuggerOpener } from './debugger';

const CTRL_C = '\x03';
const CTRL_D = '\x04';
const BROADCAST_THROTTLE_DELAY = 500;

export interface InteractiveCommand {
  key: string;
  shift?: boolean;
  description: string | (() => string);
  handler: (this: InteractiveCommandContext) => void;
}

export interface InteractiveCommandContext {
  server: DevServer;
  logger: Logger;
}

export interface InteractiveModeOptions {
  devServer: DevServer;
  extraCommands?: InteractiveCommand[];
}

export function setupInteractiveMode(options: InteractiveModeOptions) {
  const { devServer, extraCommands = [] } = options;

  if (!devServer.instance.server.listening) {
    throw new Error(
      'Dev server is not listening. Please call `devServer.instance.listen()` first.',
    );
  }

  if (!(process.stdin.isTTY && process.stdin instanceof ReadStream)) {
    logger.warn('Interactive mode is not supported in non-interactive environments');
    return;
  }

  const debuggerOpener = new DebuggerOpener(
    devServer.config.root,
    devServer.instance.listeningOrigin,
  );

  const defaultCommands = getDefaultCommands(devServer, debuggerOpener);
  const allCommands = [...defaultCommands, ...extraCommands];
  assertHasNoDuplicateCommands(defaultCommands, extraCommands);

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  devServer.on('client.connected', () => {
    void debuggerOpener.autoOpen().catch(() => {
      logger.error('Failed to open debugger');
    });
  });

  process.stdin.on('keypress', (_, key: readline.Key) => {
    const { ctrl = false, shift = false } = key;
    const sequence = key.sequence?.toLowerCase();

    if (sequence == null || debuggerOpener.isPrompting()) {
      return;
    }

    if (ctrl && [CTRL_C, CTRL_D].includes(sequence)) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.emit('SIGINT');
      process.exit(0);
    }

    const targetCommand = allCommands.find(
      (command) => command.key === sequence && (command.shift ?? false) === shift,
    );

    if (targetCommand) {
      targetCommand.handler.call({ server: devServer, logger });
    }
  });

  console.log();
  allCommands.forEach((command, index) => {
    if (defaultCommands.length === index) {
      console.log(); // Extra commands separator
    }

    const leadingLabel = command.shift ? '»' : '» Press';
    const shortcut = chalk.bold(shortcutLabel(command.key, command.shift));
    console.log(
      `${leadingLabel} ${shortcut} │ ${typeof command.description === 'function' ? command.description() : command.description}`,
    );
  });
}

function getDefaultCommands(
  devServer: DevServer,
  debuggerOpener: DebuggerOpener,
): InteractiveCommand[] {
  return [
    {
      key: 'r',
      description: 'Reload app',
      handler: throttle(() => {
        logger.info('Reloading app...');
        devServer.message.broadcast('reload');
      }, BROADCAST_THROTTLE_DELAY),
    },
    {
      key: 'j',
      description: 'Open DevTools',
      handler: () => {
        debuggerOpener.open().catch(() => {
          logger.error('Failed to open debugger');
        });
      },
    },
    {
      key: 'd',
      description: 'Show developer menu',
      handler: throttle(() => {
        logger.info('Showing developer menu...');
        devServer.message.broadcast('devMenu');
      }, BROADCAST_THROTTLE_DELAY),
    },
    {
      key: 'd',
      shift: true,
      description: () => {
        const autoOpenEnabled = debuggerOpener.isAutoOpenEnabled();
        return `Toggle auto opening developer tools on startup (${chalk.bold(autoOpenEnabled ? 'enabled' : 'disabled')})`;
      },
      handler: () => {
        const autoOpenEnabled = debuggerOpener.isAutoOpenEnabled();
        const newAutoOpenEnabled = !autoOpenEnabled;
        debuggerOpener.setAutoOpenEnabled(newAutoOpenEnabled);
        logger.info(
          `Auto opening developer tools: ${chalk.bold(newAutoOpenEnabled ? 'enabled' : 'disabled')}`,
        );
      },
    },
  ];
}

function shortcutLabel(key: string, shift?: boolean) {
  if (shift) {
    return `shift+${key}`;
  }
  return key;
}

function assertHasNoDuplicateCommands(
  defaultCommands: InteractiveCommand[],
  commands: InteractiveCommand[],
) {
  const defaultCommandKeys = defaultCommands.map(({ key, shift }) => shortcutLabel(key, shift));
  const commandKeys = commands.map(({ key, shift }) => shortcutLabel(key, shift));
  const duplicateKeys = commandKeys.filter((key) => defaultCommandKeys.includes(key));

  const invalidCommandKeys = commands
    .filter(({ key }) => key.length > 1)
    .map(({ key, shift }) => shortcutLabel(key, shift));
  if (invalidCommandKeys.length > 0) {
    throw new Error(`Invalid commands: ${invalidCommandKeys.join(', ')}`);
  }

  if (duplicateKeys.length > 0) {
    throw new Error(`Duplicate commands: ${duplicateKeys.join(', ')}`);
  }
}
