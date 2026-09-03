import { createUi } from '@devframes/hub-ui';
import { initHub } from '@devframes/hub/initiate';
import type { DevframeHubContext } from '@devframes/hub/types';

import type { Plugin, RollipopDevToolsNodeContext } from '../../core/plugins/types';
import type { DevServer, DevServerContext } from '../types';
import { createAgentToolContext } from './agent/context';
import { RollipopDevframeController } from './index';

const DEVFRAME_NAME = 'Rollipop';
const ROLLIPOP_DEVFRAME_BASE = '/__rollipop/';
const ROLLIPOP_DEVFRAME_SSE_ROUTE = '__sse';
const ROLLIPOP_DEVFRAME_MCP_PATH = '__mcp';

export async function setupDevframe(context: DevServerContext, server: DevServer) {
  const controller = new RollipopDevframeController(context, createAgentToolContext(context));
  const devtools = initHub({
    name: DEVFRAME_NAME,
    version: globalThis.__ROLLIPOP_VERSION__,
    base: ROLLIPOP_DEVFRAME_BASE,
    cwd: context.config.root,
    ui: createUi({
      viewer: false,
      embedded: true,
      branding: {
        productName: DEVFRAME_NAME,
        primaryColor: 'hsl(207, 90%, 61%)',
        logo: '/dashboard/logo.svg',
        favicon: '/dashboard/favicon.ico',
      },
      dockPreferences: {
        defaultMode: 'edge',
        defaultPosition: 'bottom',
      },
    }),
    ws: false,
    auth: false,
    sse: { route: ROLLIPOP_DEVFRAME_SSE_ROUTE },
    mcp: { path: ROLLIPOP_DEVFRAME_MCP_PATH },
    origin: context.serverBaseUrl,
    configure: async (devtoolsContext) => {
      await controller.definition.setup(devtoolsContext);
      await invokeDevToolsSetup(devtoolsContext, server, context.config.plugins ?? []);
    },
  });
  await devtools.ready;

  server.instance.addHook('onListen', () => {
    void controller.refresh();
  });
  server.instance.addHook('onClose', async () => {
    controller.dispose();
    await devtools.close();
  });

  return devtools.nodeMiddleware;
}

async function invokeDevToolsSetup(
  context: DevframeHubContext,
  server: DevServer,
  plugins: Plugin[],
): Promise<void> {
  const rollipopContext = context as RollipopDevToolsNodeContext;
  Object.defineProperties(rollipopContext, {
    rollipopConfig: { value: server.config, enumerable: true },
    rollipopServer: { value: server, enumerable: true },
  });

  for (const plugin of plugins) {
    if (plugin.devtools?.setup == null || shouldSkipDevToolsSetup(plugin)) {
      continue;
    }

    try {
      await plugin.devtools.setup(rollipopContext);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to set up devtools for plugin "${plugin.name}": ${reason}`, {
        cause: error,
      });
    }
  }
}

function shouldSkipDevToolsSetup(plugin: Plugin): boolean {
  const capabilities = plugin.devtools?.capabilities?.dev;
  if (capabilities === false) {
    return true;
  }
  if (typeof capabilities !== 'object' || capabilities == null) {
    return false;
  }
  return Object.values(capabilities).includes(false);
}
