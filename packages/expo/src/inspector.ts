import type { ServerOptions } from 'rollipop';

import type { ExpoCompatibility } from './compatibility';

// Expo adds a Network CDP bridge and inspector handlers to React Native's middleware. Reuse the complete implementation so its native client can keep /inspector/network connected.
export default function createExpoInspector(
  compatibility: ExpoCompatibility,
  serverBaseUrl: string,
): NonNullable<ServerOptions['inspector']> {
  const { debugMiddleware, debugWebsocketEndpoints } = compatibility.cli.createDebugMiddleware({
    serverBaseUrl,
    reporter: {
      update({ level, data }: { level: 'debug' | 'info' | 'warn' | 'error'; data: unknown[] }) {
        console[level](...data);
      },
    },
  });
  return { middleware: debugMiddleware, websocketEndpoints: debugWebsocketEndpoints };
}
