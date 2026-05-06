# @rollipop/plugin-module-federation

Module Federation for Rollipop. Wires `@module-federation/runtime` into the host bundle and emits a self-contained IIFE for each remote, with shared dependencies resolved through a host-owned global registry.

## Roles

A single Rollipop config takes one role. Defining both `remotes` and `exposes` throws.

| Role   | Has       | Bundle output                                                                |
| ------ | --------- | ---------------------------------------------------------------------------- |
| Host   | `remotes` | Normal Rollipop bundle. `import('<remote>/<expose>')` is rewritten at build. |
| Remote | `exposes` | IIFE that registers a federation container on `globalThis`.                  |

## Host

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
const RemoteNavigator = React.lazy(() =>
  import('remote_app/RemoteNavigator').then((m) => ({ default: m.default ?? m })),
);
```

The plugin rewrites the `import()` call into a `loadRemote` invocation against the federation runtime — no native `import()` evaluation happens at runtime.

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

The bundle is emitted as IIFE. Each shared dep import (e.g. `import RN from 'react-native'`) is replaced with a stub that reads from the host's `globalThis.__rollipop_shared__` registry and throws if the dep is not registered. Rollipop's prelude / polyfills are skipped because the host has already initialized the React Native runtime.

## Script loader contract

Defined at `@rollipop/plugin-module-federation/runtime`:

```ts
export interface ModuleFederationScriptLoader {
  loadScript(args: { scriptId: string; url: string; parentUrl?: string }): Promise<void>;
}
```

The host registers an implementation on `globalThis.__rollipop_script_loader__`. The plugin's MF runtime adapter delegates `loadEntry` to it. After the script is evaluated the container is read back from `globalThis[<entryGlobalName>]`.

## Globals exposed at runtime

| Global                       | Owner  | Purpose                                                                 |
| ---------------------------- | ------ | ----------------------------------------------------------------------- |
| `__rollipop_script_loader__` | user   | `ModuleFederationScriptLoader` implementation.                          |
| `__rollipop_shared__`        | host   | Shared dependency registry. Lazily populated; missing keys throw.       |
| `__rollipop_load_remote__`   | plugin | `(id: string) => Promise<unknown>` — wraps the federation `loadRemote`. |

## Constraints

- A single config cannot define both `remotes` and `exposes`.
- React Native does not support native `import()`. Static imports of remote modules are intentionally not supported — use dynamic `import('<remote>/<expose>')`.
- Subpath imports of shared deps (`react/jsx-dev-runtime`, etc.) are bundled into the remote and consume the parent shared instance through `__rollipop_shared__`.

See `examples/module-federation` for a working RN 0.84 host + remote setup with a Pure C++/Obj-C++ TurboModule script loader.
