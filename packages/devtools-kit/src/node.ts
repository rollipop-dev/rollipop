import type { DevframeViewIframe } from '@devframes/hub/types';
import type { DevframeDefinition } from 'devframe/types';
import type { DevToolsPluginOptions, Plugin, RollipopDevToolsNodeContext } from 'rollipop';

export interface CreatePluginFromDevframeOptions {
  /**
   * Rollipop plugin name override.
   *
   * Defaults to `devframe:${devframe.id}`.
   */
  name?: string;
  /**
   * Mount path override.
   *
   * Defaults to `devframe.basePath` or `/__${devframe.id}/`.
   */
  base?: string;
  /**
   * Overrides for the auto-synthesized iframe dock entry.
   */
  dock?: Partial<Omit<DevframeViewIframe, 'id' | 'type' | 'url'>>;
  /**
   * Capability flags forwarded to the Rollipop plugin's `devtools` slot.
   *
   * Defaults to `devframe.capabilities`.
   */
  capabilities?: DevToolsPluginOptions['capabilities'];
  /**
   * Additional Rollipop-only setup that runs after the devframe is installed.
   */
  setup?: (context: RollipopDevToolsNodeContext) => void | Promise<void>;
}

export function createPluginFromDevframe(
  devframe: DevframeDefinition,
  options: CreatePluginFromDevframeOptions = {},
): Plugin {
  const {
    name = `devframe:${devframe.id}`,
    capabilities = devframe.capabilities,
    base,
    dock,
  } = options;

  return {
    name,
    devtools: {
      capabilities,
      async setup(context) {
        await context.install(devframe, { base, dock });
        await options.setup?.(context);
      },
    },
  };
}
