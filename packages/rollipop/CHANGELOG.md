# rollipop

## 1.0.0-alpha.21

### Minor Changes

- 14c92f6: Add `envFile` configuration option for customizing the basename used to resolve environment files. Defaults to `.env`; the loader still looks for `${envFile}`, `${envFile}.local`, `${envFile}.[mode]`, and `${envFile}.[mode].local`. Set it to a custom basename such as `.rollipop-env` to opt out of the default `.env` naming.

### Patch Changes

- e45aedd: Add `@rollipop/jest-preset` — a jest preset and transformer that runs your tests through rollipop's rust-side transform pipeline.
- 9d18670: Expose Flow config for the native transform pipeline.
- 7934e0d: support non-image assets without dimensions
- 757756b: resolve React Native package alias fields by default
- 3e58d68: bump `@rollipop/rolldown` to 1.0.5

## 0.1.0-alpha.20

### Patch Changes

- d6e10db: bump @rollipop/rolldown to 1.0.2
- 140902b: impl @rollipop/plugin-module-federation

## 0.1.0-alpha.19

### Patch Changes

- a54c414: emit sourcemap sources relative to project root
- 419aa29: bump @rollipop/rolldown to 1.0.1

## 0.1.0-alpha.18

### Patch Changes

- fa83644: trigger publish

## 0.1.0-alpha.17

### Patch Changes

- 5985887: Include `src/runtime/hmr-client.ts` in the published tarball. The `./hmr-client` export maps to this raw TypeScript source, but the `files` field in `package.json` only listed `bin`, `dist`, and `client.d.ts` — so consumers hitting `import 'rollipop/hmr-client'` against a published version would fail to resolve the file.

## 0.1.0-alpha.16

### Patch Changes

- 915ef17: Add a `GET /bundlers/:id/status` dev-server endpoint that returns the current lifecycle state of the bundler with that id as a JSON snapshot — `{ "id": "<id>", "status": "idle" | "building" | "build-done" | "build-failed" }`. `:id` matches the bundler id carried in build SSE events. Unknown ids return 404 with `{ "error": "not found" }`. Bare `/status` is unaffected and keeps returning the React Native community middleware's `packager-status:running` response.
- a80492f: Drop the filesystem-cache class now that rolldown owns the build cache natively. The unused `BundlerContext.cache` field, the `FileSystemCache` class, and the `Cache` interface are removed. The remaining live pieces — resolving the cache directory and clearing it — live in `src/utils/reset-cache.ts` as plain functions (`getCacheDirectory`, `resetCache`). The `/reset-cache` control endpoint, the `reset_cache` MCP tool, and the `--reset-cache` CLI flag all continue to work unchanged for callers.
- 7ea2625: Replace `BuiltinPlugins` namespace with the `rollipop/plugins` sub-path. Built-in plugins are now imported by name:

  ```ts
  // Before
  import { BuiltinPlugins } from "rollipop";
  plugins: [BuiltinPlugins.worklets()];

  // After
  import { worklets } from "rollipop/plugins";
  plugins: [worklets()];
  ```

- 14ebb2c: Always use the filesystem bundle store and drop the `BUNDLE_STORE` env var. Bundles are now written to disk on every build for easier debugging; user-modified files take precedence until the next rebuild overwrites them.

## 0.1.0-alpha.15

### Patch Changes

- 359affa: perf: migrate to native bindings

## 0.1.0-alpha.14

### Patch Changes

- dca60fd: add `devMode.useFileSystemBundle` for raw bundle debugging
- 2c1a088: enable `externalHelpers`
- 7438e0b: bump version up dependencies

## 0.1.0-alpha.13

### Patch Changes

- 67d29b4: fix cjs compatibility for commands
- 49ec649: export esm only

## 0.1.0-alpha.12

### Patch Changes

- f56f1bf: add `optimization.lazyBarrel` option
- 5bb74ab: replace `statue` plugin to `reporter` plugin

## 0.1.0-alpha.11

### Patch Changes

- 7fcbed3: expose more rolldown config options

## 0.1.0-alpha.10

### Patch Changes

- c28f5e2: bump version up `@rollipop/rolldown` to '0.0.0-beta.3'
- c2b7b42: fix default option for `dev`
- 4f8e194: add `ROLLIPOP_REACT_NATIVE_PATH` for override default `react-native` path

## 0.1.0-alpha.9

### Patch Changes

- 200e373: noop in `onHmrUpdates` when HMR is disabled
- 099598b: esm only
- 5b9fd00: update default `dev` option
- 19c5b71: add built-in constants environment variables

## 0.1.0-alpha.8

### Patch Changes

- adf0937: improve HRM runtime compatibility for lower runtime versions
- cd796f7: fix hermes performance degradation issue

## 0.1.0-alpha.7

### Patch Changes

- 66477ec: implement deferred caching with batch flush
- 646d819: resolve HMR not working when cache is enabled
- 78a57d4: add dotenv-based environment variable loading

## 0.1.0-alpha.6

### Patch Changes

- a7b7150: use `enqueueUpdate` instead of `performReactRefresh`

## 0.1.0-alpha.5

### Patch Changes

- eaa76df: allow `TopLevelFilterExpression` and expose `/pluginutils` subpath
- d12877d: add `babel`, `swc` configs
- 65fe653: add websocket param to `HMRCustomHandler`

## 0.1.0-alpha.4

### Patch Changes

- fix yarn workspace
- Updated dependencies

## 0.1.0-alpha.3

### Patch Changes

- fe6a1db: npm oidc
- Updated dependencies [fe6a1db]

## 0.1.0-alpha.2

### Patch Changes

- e8d32a7: improve `configureServer` hook
- 5cee54c: supports custom HMR handler
- 4768f8f: add `configureServer`
- Updated dependencies [e8d32a7]
- Updated dependencies [8118bc3]
- Updated dependencies [5cee54c]
- Updated dependencies [4768f8f]

## 0.1.0-alpha.1

### Patch Changes

- 3d72e91: add `config` and `configResolved` for plugins
- Updated dependencies [e21eeb5]
- Updated dependencies [3d72e91]

## 0.1.0-alpha.0

### Minor Changes

- 7a1d9a7: pre-alpha

### Patch Changes

- Updated dependencies [7a1d9a7]
