import { UNSUPPORTED_OPTION_DESCRIPTION } from '../../constants';
import type { CommandDefinition } from '../../types';
import { parseBoolean, resolvePath } from '../../utils';

export interface BundleCommandArgs {
  assetsDest?: string;
  assetCatalogDest?: string;
  entryFile: string;
  resetCache: boolean;
  minify?: boolean;
  config?: string;
  platform: string;
  dev: boolean;
  bundleOutput: string;
  sourcemapOutput?: string;
  sourcemapSourcesRoot?: string;
  sourcemapUseAbsolutePath: boolean;
  // Rollipop specific options
  cache?: boolean;
}

export const command: CommandDefinition<BundleCommandArgs> = {
  name: 'bundle',
  description: 'Build the bundle for the provided JavaScript entry file.',
  action: async function (options) {
    const { action: bundleAction } = await import('./action');
    return bundleAction.call(this, options);
  },
  options: [
    {
      name: '--config <string>',
      description: 'Path to the CLI configuration file',
      parse: resolvePath,
    },
    {
      name: '--entry-file <path>',
      description: 'Path to the root JS file, either absolute or relative to JS root',
    },
    {
      name: '--platform <string>',
      description: 'Either "ios" or "android"',
      default: 'ios',
    },
    {
      name: '--dev [boolean]',
      description: 'If false, warnings are disabled and the bundle is minified',
      parse: parseBoolean,
    },
    {
      name: '--minify [boolean]',
      description:
        'Allows overriding whether bundle is minified. This defaults to ' +
        'false if dev is true, and true if dev is false. Disabling minification ' +
        'can be useful for speeding up production builds for testing purposes.',
      parse: parseBoolean,
    },
    {
      name: '--cache [boolean]',
      description: 'If false, the bundler will not load or store any cache',
      parse: parseBoolean,
    },
    {
      name: '--bundle-output <string>',
      description: 'File name where to store the resulting bundle, ex. /tmp/groups.bundle',
      required: true,
    },
    {
      name: '--sourcemap-output <string>',
      description:
        'File name where to store the sourcemap file for resulting bundle, ex. /tmp/groups.map',
    },
    {
      // TODO
      name: '--sourcemap-sources-root <string>',
      description: `Path to make sourcemap's sources entries relative to, ex. /root/dir`,
    },
    {
      // TODO
      name: '--sourcemap-use-absolute-path',
      description: 'Report SourceMapURL using its full path',
    },
    {
      name: '--assets-dest <string>',
      description: 'Directory name where to store assets referenced in the bundle',
    },
    {
      name: '--reset-cache',
      description: 'Removes cached files',
      default: false,
    },
    {
      name: '--transformer <string>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--bundle-encoding <string>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--max-workers <number>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--unstable-transform-profile <string>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--asset-catalog-dest [string]',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--read-global-cache',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
    {
      name: '--resolver-option <string...>',
      description: UNSUPPORTED_OPTION_DESCRIPTION,
    },
  ],
};
