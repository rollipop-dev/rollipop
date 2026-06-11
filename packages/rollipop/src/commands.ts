import { createReactNativeCliCommand } from './node/cli-utils';
import { command as agentCommand } from './node/commands/agent';
import { command as bundleCommand } from './node/commands/bundle';
import { command as startCommand } from './node/commands/start';

const commands = [
  createReactNativeCliCommand(startCommand),
  createReactNativeCliCommand(bundleCommand),
  createReactNativeCliCommand(agentCommand),
] as const;

export {
  // ESM entry
  commands as default,
  // CJS entry
  commands as 'module.exports',
};
