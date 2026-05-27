import { program } from '@commander-js/extra-typings';

import { version } from '../../package.json' with { type: 'json' };
import { Logo } from '../common/logo';
import { createCommand } from './cli-utils';
import { command as agentCommand } from './commands/agent';
import { command as bundleCommand } from './commands/bundle';
import { command as startCommand } from './commands/start';

export function run(argv: string[]) {
  Logo.printOnce();

  const cli = program.name('rollipop').version(version);

  cli.addCommand(createCommand(agentCommand));
  cli.addCommand(createCommand(bundleCommand));
  cli.addCommand(createCommand(startCommand));

  cli.parse(argv);
}
