# @rollipop/plugin-module-federation

Share modules and dependencies between React Native bundles.

## Status

> Experimental: the API and bundle layout may change. A config cannot both consume and expose remotes.

## Roles

A single Rollipop config takes one role. Defining both `remotes` and `exposes` throws.

| Role   | Option    | Purpose                                                |
| ------ | --------- | ------------------------------------------------------ |
| Host   | `remotes` | Loads remote modules and provides shared dependencies. |
| Remote | `exposes` | Exposes modules to hosts.                              |

## Host

The script loader below uses the native `ScriptManager` supplied by the
[`module-federation` example](../../examples/module-federation/mf-script-loader.ts).
Provide a loader for your own app's native implementation.

```ts
// rollipop.host.config.ts
import { federation } from '@rollipop/plugin-module-federation';
import { defineConfig } from 'rollipop';

export default defineConfig({
  entry: 'src/host/index.ts',
  plugins: [
    federation({
      name: 'host_app',
      remotes: {
        remote_app: 'remote_app@http://localhost:8082/index.bundle?platform=ios',
      },
      shared: {
        react: { singleton: true, eager: true, requiredVersion: '19.2.3' },
        'react-native': { singleton: true, eager: true, requiredVersion: '0.84.1' },
      },
      runtime: {
        implement: `
          const NativeScriptManager = globalThis.nativeModuleProxy.ScriptManager;
          globalThis.__rollipop_script_loader__ = {
            async loadScript({ scriptId, url }) {
              await NativeScriptManager.loadScript(scriptId, { url });
            },
          };
        `,
      },
    }),
  ],
});
```

In your app, consume the remote with dynamic import:

```ts
import * as React from 'react';

const RemoteNavigator = React.lazy(() =>
  import('remote_app/RemoteNavigator').then((m) => ({ default: m.default ?? m })),
);
```

Render the imported component inside a React `Suspense` boundary while it loads.

Failed remote loads are thrown to the nearest React Error Boundary. From its retry action,
reload the remote before resetting the boundary:

```ts
import { retryRemote } from '@rollipop/plugin-module-federation/runtime';

await retryRemote('remote_app/RemoteNavigator');
resetErrorBoundary();
```

Pass the import alias and exposed path to `retryRemote`. Failed retries reject.

## Remote

```ts
// rollipop.remote.config.ts
import { federation } from '@rollipop/plugin-module-federation';
import { defineConfig } from 'rollipop';

export default defineConfig({
  entry: 'src/remote/index.ts',
  plugins: [
    federation({
      name: 'remote_app',
      exposes: {
        './RemoteNavigator': './src/remote/exposed/RemoteNavigator.tsx',
      },
      shared: {
        react: { singleton: true, requiredVersion: '19.2.3' },
        'react-native': { singleton: true, requiredVersion: '0.84.1' },
      },
    }),
  ],
});
```

Remotes support HMR when served by the development server.

## Script loader contract

Defined at `@rollipop/plugin-module-federation/runtime`:

```ts
export interface ModuleFederationScriptLoader {
  loadScript(args: { scriptId: string; url: string; parentUrl?: string }): Promise<void>;
}
```

Register a loader on `globalThis.__rollipop_script_loader__`. Its `loadScript` method must download and evaluate the bundle before resolving.

## Constraints

- A config cannot define both `remotes` and `exposes`. Run hosts and remotes as separate Rollipop processes.
- Remote imports support default React component exports.
- Shared dependency subpaths (such as `react/jsx-dev-runtime`) are bundled separately in each remote.

See `examples/module-federation` for a working RN 0.84 host + remote setup with a Kotlin/JNI and Obj-C++ script loader.

See [Configuration](https://rollipop.dev/docs/features/module-federation#configuration) for remote syntax, shared dependencies, and `shareStrategy`.
