import { DEFAULT_HOST, DEFAULT_PORT } from '../../../server';
import { UNSUPPORTED_OPTION_DESCRIPTION } from '../../constants';
import { CommandDefinition } from '../../types';
import { parseBoolean, resolvePath } from '../../utils';
import { action } from './action';

/**
 * @see https://github.com/facebook/react-native/blob/0.83-stable/packages/community-cli-plugin/src/commands/start/runServer.js#L27-L45
 */
export interface StartCommandOptions {
  config?: string;
  host?: string;
  port?: number;
  https?: boolean;
  cert?: string;
  key?: string;
  interactive: boolean;
  clientLogs: boolean;
  resetCache?: boolean;
  // Rollipop specific options
  cache?: boolean;
  mcp?: boolean;
}

export const command: CommandDefinition<StartCommandOptions> = {
  name: 'start',
  description: 'Start the React Native development server.',
  action,
  options: [
    {
      name: '--config <string>',
      description: 'Path to the CLI configuration file',
      parse: resolvePath,
    },
    {
      name: '--host <string>',
      description: 'Host to start the development server on',
      default: DEFAULT_HOST,
    },
    {
      name: '--port <number>',
      description: 'Port to start the development server on',
      default: DEFAULT_PORT,
      parse: Number,
    },
    {
      name: '--reset-cache, --resetCache',
      description: 'Removes cached files',
    },
    {
      name: '--https',
      description: 'Enables https connections to the server',
    },
    {
      name: '--key <path>',
      description: 'Path to custom SSL key',
    },
    {
      name: '--cert <path>',
      description: 'Path to custom SSL cert',
    },
    {
      name: '--no-interactive',
      description: 'Disables interactive mode',
    },
    {
      name: '--client-logs',
      description:
        '[Deprecated] Enable plain text JavaScript log streaming for all ' +
        'connected apps. This feature is deprecated and will be removed in ' +
        'future.',
      default: false,
    },
    {
      name: '--cache [boolean]',
      description: 'If false, the bundler will not load or store any cache',
      parse: parseBoolean,
    },
    {
      name: '--mcp',
      description: 'Enable the MCP server at /mcp',
    },
    {
      name: '--projectRoot <path>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--watchFolders <list>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--assetPlugins <list>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--sourceExts <list>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--max-workers <number>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--transformer <string>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--custom-log-reporter-path, --customLogReporterPath <string>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
  ],
};
