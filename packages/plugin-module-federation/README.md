# @rollipop/plugin-module-federation

Module Federation for Rollipop. Wires `@module-federation/runtime` into the host bundle and registers each remote's container on `globalThis`, with shared dependencies resolved through a host-owned global registry.

## Status

> **Initial implementation.** This plugin is an early-stage feature. The public
> API and the bundle layout may change, and the role model is intentionally
> narrower than standard Module Federation — see [Roles](#roles) and
> [Constraints](#constraints).
>
> Notably, a single config takes exactly one role (host **or** remote). Standard
> (web) Module Federation lets one build both `expose` modules and `consume`
> remotes; that bidirectional / chained-federation model is **not supported
> yet**. Lifting it requires emitting the federation container as a separate
> artifact from the app bundle, which is not implemented at this stage.

## Roles

A single Rollipop config takes one role. Defining both `remotes` and `exposes` throws.

| Role   | Has       | Bundle output                                                 |
| ------ | --------- | ------------------------------------------------------------- |
| Host   | `remotes` | Normal Rollipop bundle that consumes remotes at runtime.      |
| Remote | `exposes` | IIFE for static builds; Rollipop format with HMR when served. |

## Host

The script loader below uses the native `ScriptManager` supplied by the
[`module-federation` example](../../examples/module-federation/mf-script-loader.ts).
Provide a loader for your own app's native implementation.

```ts
// rollipop.host.config.ts
import { federation } from '@rollipop/plugin-module-federation';
import { defineConfig } from 'rollipop';

export default defineConfig({
  entry: 'src/host/index.js',
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
        // Register a `ModuleFederationScriptLoader` on `globalThis.__rollipop_script_loader__`.
        // Typically delegates to a native TurboModule that does fetch + JSI evaluate.
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

The imported module's default export is a React component proxy. Rendering it loads the remote
through the federation runtime and suspends while the request is pending, so render it inside a
React `Suspense` boundary. The bundled code does not use native `import()` to fetch the remote.

Failed remote loads are thrown to the nearest React Error Boundary. From its retry action,
reload the remote before resetting the boundary:

```ts
import { retryRemote } from '@rollipop/plugin-module-federation/runtime';

await retryRemote('remote_app/RemoteNavigator');
resetErrorBoundary();
```

Concurrent loads share one request. If a retry fails, the promise rejects and the boundary
can keep showing its fallback until the user retries again.

## Remote

```ts
// rollipop.remote.config.ts
import { federation } from '@rollipop/plugin-module-federation';
import { defineConfig } from 'rollipop';

export default defineConfig({
  entry: 'src/remote/index.js',
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

Static builds emit an IIFE; the dev server uses Rollipop's format so each remote has its own HMR
runtime. Each shared dependency import (e.g. `import RN from 'react-native'`) is replaced with a
stub that reads from the host's `globalThis.__rollipop_shared__` registry and throws if the
dependency is not registered. Rollipop's prelude and polyfills are skipped because the host has
already initialized the React Native runtime.

## Script loader contract

Defined at `@rollipop/plugin-module-federation/runtime`:

```ts
export interface ModuleFederationScriptLoader {
  loadScript(args: { scriptId: string; url: string; parentUrl?: string }): Promise<void>;
}
```

The host registers an implementation on `globalThis.__rollipop_script_loader__`. The plugin's MF runtime adapter delegates `loadEntry` to it. After the script is evaluated the container is read back from `globalThis[<entryGlobalName>]`.

## Globals exposed at runtime

| Global                                 | Owner  | Purpose                                                                              |
| -------------------------------------- | ------ | ------------------------------------------------------------------------------------ |
| `__rollipop_script_loader__`           | user   | `ModuleFederationScriptLoader` implementation.                                       |
| `__rollipop_shared__`                  | host   | Shared dependency registry populated during host initialization; missing keys throw. |
| `__rollipop_module_federation_cache__` | plugin | Internal cache of loaded modules, pending requests, and load errors.                 |

Use `retryRemote` from `@rollipop/plugin-module-federation/runtime` to retry a failed request.

## Constraints

- A single config cannot define both `remotes` and `exposes` — this is a
  current-implementation limitation, not an inherent Module Federation rule.
  Split a host and a remote into two configs and run them as separate Rollipop
  processes. See [Status](#status).
- Remote imports expose a default React component proxy. Dynamic `import('<remote>/<expose>')`
  returns that proxy, rather than the remote module's namespace directly.
- Subpath imports of shared deps (`react/jsx-dev-runtime`, etc.) are bundled into the remote and consume the parent shared instance through `__rollipop_shared__`.

See `examples/module-federation` for a working RN 0.84 host + remote setup with a Pure C++/Obj-C++ TurboModule script loader.
