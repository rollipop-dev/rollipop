# Rollipop Architecture

Rollipop is a React Native build toolkit built on Rolldown. Rolldown owns the bundler core; Rollipop owns React Native orchestration, compatibility surfaces, runtime integration, and native extensions that are specific to React Native.

This document describes that boundary: what belongs in the JavaScript orchestration layer, what belongs in the native `@rollipop/rolldown` fork, and which performance constraints shape those decisions.

## Design goals

Rollipop is designed to make Rolldown usable for React Native without replacing the workflows React Native projects already depend on.

Rolldown remains the bundler core. Rollipop reuses Rolldown's graph, resolver, linker, tree-shaker, plugin driver, and code generation machinery wherever possible. React Native support is expressed as target configuration, plugins, runtime integration, and output finalization around that core.

React Native compatibility is treated as a public contract. Rollipop does not copy Metro's internal architecture, but it preserves the surfaces React Native apps and tools observe: CLI integration, development server APIs, asset loading, sourcemaps, symbolication, and HMR. The implementation behind those surfaces can be different.

Modern frontend conventions are first-class. Standard package resolution, monorepo-friendly dependency layouts, Yarn PnP compatibility, tree-shaking, and the Rollup/Rolldown plugin model are part of the architecture rather than optional escape hatches.

Performance-sensitive work runs where it is cheapest. The JavaScript layer describes intent and composes behavior; native code owns hot, parse-heavy, graph-aware, or codegen-adjacent work. The same rule applies inside the JS layer: avoid entering plugin hooks or transform pipelines for modules that can be excluded earlier.

Build, development, and test should share transform semantics. A test transform should not be a separate Babel pipeline that only approximates the bundle transform; it should reuse the same assumptions wherever possible.

## Responsibility boundary

Rollipop has two architectural layers.

The Rollipop JavaScript package is the user-facing orchestration layer. It prepares build targets, configures Rolldown with React Native defaults, wires built-in plugins, runs the production build path, runs the development server, and provides Metro-compatible endpoints for React Native tooling. This is where policy lives: which transforms are enabled for a target, how plugin rules are collected, how transform work is skipped, and how server APIs are shaped.

The `@rollipop/rolldown` package is the native execution layer. It is a hard fork of Rolldown published from the [rollipop-dev/rolldown](https://github.com/rollipop-dev/rolldown) repository. The fork contains behavior that needs to run close to Rolldown's graph, plugin driver, or code generation stages: the Rollipop output format, the native React Native transformer, the persistent transform cache, the native React Refresh wrapper, and the bindings that expose these capabilities back to JavaScript.

The boundary is intentional. JS orchestration is preferred for configuration, composition, and compatibility glue. Native implementation is preferred when repeated parsing, Rust-to-JS calls, graph-aware decisions, or post-processing emitted code would make the design slower or more fragile.

## High-level build flow

```text
CLI / API
  -> Rollipop target presets and user config
  -> runBuild() or runServer()
  -> preconfigured @rollipop/rolldown build/dev engine
  -> native Rollipop plugins and finalizer
  -> React Native-compatible bundle, sourcemap, assets, and HMR behavior
```

Rolldown still owns the core bundler work: module loading, resolving, parsing, linking, tree-shaking, and most code generation machinery. Rollipop changes the React Native-specific inputs and outputs around that core instead of replacing the bundler pipeline wholesale.

## Build mode

`runBuild()` prepares the production build target and calls Rolldown's `build` API with Rollipop's preconfigured values. Those values include React Native-oriented resolver behavior, bundle globals, prelude/polyfill injection, asset handling, the Rollipop output format, and optional persistent transform caching.

The production build path stays intentionally small: once the target is described, Rolldown does the bundling work. Rollipop-specific behavior enters through explicit plugins, output options, and finalization rather than ad-hoc work after the bundle has already been emitted.

## Dev server mode

`runServer()` prepares the development target and starts a Fastify-based server with React Native-compatible APIs. The server is not Metro internally, but it preserves the interface shape that React Native clients, dev middleware, symbolication, bundle requests, asset requests, and HMR clients expect.

The dev server's bundler engine is based on Rolldown's `devEngine`. Rollipop wraps that engine with request routing, build state, HMR transport, and React Native runtime integration. Incremental rebuilds and module graph updates stay in the native bundler; device/server protocol compatibility stays in the Rollipop server layer.

## Metro compatibility

Metro compatibility is an external contract, not an implementation strategy. Rollipop does not try to reproduce Metro's internals. Instead, it makes the parts React Native observes look familiar:

- bundle and sourcemap requests use React Native-compatible URL and response shapes;
- asset and symbolication flows match the expectations of React Native tooling;
- development middleware and device communication are wired into the same server surface;
- HMR messages are bridged between React Native clients and Rolldown-backed module updates.

This lets React Native apps and tooling continue to operate against familiar interfaces while Rollipop changes the implementation underneath.

## Plugin call optimization

Rolldown plugins can cross the Rust-to-JS boundary very frequently. If a hook does not declare a filter, Rolldown may need to call into JavaScript for many modules only for the handler to immediately return after checking id, code, or module type. Rollipop treats this as a core performance concern.

Core plugins use object-form hooks with `filter` whenever the decision can be expressed statically. The filter lets Rolldown evaluate the condition on the Rust side and skip the JS call entirely for non-matching modules (https://rolldown.rs/apis/plugin-api/hook-filters). An unfiltered hook should either intentionally observe all modules or depend on state that cannot be expressed as a Rolldown hook filter.

Rollipop also uses a JavaScript transform boundary to prevent unnecessary later work. `withTransformBoundary()` gives built-in transform plugins a shared place to record transform metadata and flags. `TransformFlag.SKIP_ALL` is the important example: once a module is known to need no further JS/SWC/Babel processing, later stages skip it instead of parsing it again.

Babel and SWC rules follow the same idea. Rules are first narrowed with Rolldown hook filters. Only matching rules are collected for a module, and the actual transform pipeline is entered only when collected rules or transform flags require it. This avoids paying parse and transform costs for modules that no configured rule can affect.

The HMR client replacement plugin is a simple example of the filter rule. The hook only needs to run for React Native's configured `HMRClient.js` path, so the path check is expressed as a Rolldown filter instead of a JavaScript-side early return:

```ts
const replaceHMRClientPlugin: rolldown.Plugin = {
  name: 'rollipop:replace-hmr-client',
  load: {
    filter: [include(id(exactRegex(resolvedHmrClientPath)))],
    handler(id) {
      this.debug(`Replacing HMR client: ${id}`);
      return { code: hmrConfig.clientImplement, moduleType: 'ts' };
    },
  },
};
```

`TransformFlag` is the second half of the same strategy. Filters prevent unnecessary Rust-to-JS calls before a hook runs; flags prevent unnecessary work after a module has already entered the transform pipeline. Flags are stored in module metadata and scoped to the current build revision, so watch rebuilds do not accidentally reuse stale transform decisions.

```ts
export enum TransformFlag {
  NONE = 0b00000000,
  CODEGEN_REQUIRED = 0b00000001,
  STRIP_FLOW_REQUIRED = 0b00000010,
  SKIP_ALL = 0b10000000,
}

// JSON modules are already handled and should not enter later JS/SWC/Babel transforms.
transform: {
  order: 'pre',
  filter: [include(id(/\.json$/))],
  handler(_code, id) {
    return { meta: setFlag.call(this, context, id, TransformFlag.SKIP_ALL) };
  },
}
```

Babel and SWC then branch on the same metadata instead of reparsing every module:

```ts
const flags = getFlag.call(this, context, id);
if (flags & TransformFlag.SKIP_ALL) {
  return;
}

const shouldTransform = useNativeTransformPipeline
  ? babelOptions.length > 0
  : flags & TransformFlag.CODEGEN_REQUIRED || babelOptions.length > 0;
if (!shouldTransform) {
  return;
}
```

## Native Rolldown fork

The hard fork lives in the [rollipop-dev/rolldown](https://github.com/rollipop-dev/rolldown) repository and is published as `@rollipop/rolldown`. Bug fixes and general improvements should still go upstream when they are useful to Rolldown itself.

The fork exists for behavior that is specific to React Native and should not become a general Rolldown concern. Hermes-optimized module output is the clearest example: `OutputFormat::Rollipop` optimizes React Native bundles for Hermes, but that target-specific module shape is not something Rolldown itself needs to design around.

Owning a fork also makes it possible to move selected hot-path work from JavaScript plugins into Rust. That is a secondary benefit rather than the original reason for the fork: once Rollipop needed native customization for React Native-specific behavior, the same native surface could host the transformer pipeline, React Refresh wrapper, and persistent transform cache.

The fork should stay focused on capabilities that need native access to Rolldown internals or would be inefficient as JS plugins. Product defaults, server behavior, plugin composition, and target selection belong in the Rollipop package unless native placement is required for performance or correctness.

## Rollipop output format

Rollipop uses `OutputFormat::Rollipop` instead of standard ESM/CJS/IIFE output for app bundles. Standard Rolldown output can wrap modules in helpers such as `__esm` and `__commonJS`. That wrapper-based design is optimized for V8, but it is inefficient for Rollipop's Hermes workload.

The Rollipop format keeps Rolldown's graph analysis, linking, tree-shaking, and optimization phases, but changes the final emitted module representation. Like Metro, it emits a module table instead of relying on repeated wrapper helper execution. Rollipop does not copy Metro's implementation; it uses a similar webpack-style module factory table and a small runtime require function.

Conceptually, the runtime looks like this:

```js
var __rollipop_modules__ = {
  1: function (global, module, __rollipop_exports__, __rollipop_require__) {
    // ...
  },
  2: function (global, module, __rollipop_exports__, __rollipop_require__) {
    // ...
  },
};

var __rollipop_module_cache = {};

function __rollipop_require__(id) {
  var cached = __rollipop_module_cache[id];
  if (cached !== undefined) return cached.exports;

  var factory = __rollipop_modules__[id];
  if (factory === undefined) {
    throw new Error('Module ' + id + ' is not registered');
  }

  var module = (__rollipop_module_cache[id] = {
    id: id,
    loaded: false,
    exports: {},
  });

  factory.call(module.exports, global, module, module.exports, __rollipop_require__);
  module.loaded = true;
  return module.exports;
}
```

And generated modules conceptually become:

```js
var __rollipop_modules__ = {
  123: function (global, module, __rollipop_exports__, __rollipop_require__) {
    __rollipop_require__.r(__rollipop_exports__);
    __rollipop_require__.d(__rollipop_exports__, { value: () => App });
    var dep = __rollipop_require__(456);
    var value = dep.value + 1;
  },
  456: function (global, module, __rollipop_exports__, __rollipop_require__) {
    // ...
  },
};

__rollipop_require__(123);
```

The important design rule is that liveness decisions still belong before the finalizer. `OutputFormat::Rollipop` should change the representation of modules, not become a second tree-shaker.

## Native React Native transformer

The native React Native transformer is built for target-specific pipelines. A development target, production target, Hermes target, Hermes V1 target, Jest target, and user-configured transform target may not need the same exact passes. Rollipop configures the intended target, and the native transformer applies the corresponding pipeline.

At a high level, the transformer owns React Native-specific source transforms such as Flow handling, React Native codegen preparation, worklets handling, Hermes compatibility transforms, module conversion where needed, and sourcemap preservation. These transforms are native because they are hot, parse-heavy, and shared across many modules.

The transformer is exposed through native bindings instead of being hidden inside the bundler plugin. Other tools can reuse the same bundler-level transform pipeline without reimplementing a parallel Babel path.

The native transformer is also parameterized by runtime target. Rollipop config exposes `runtimeTarget`, currently `hermes` or `hermes-v1`, and passes the resolved value into the native plugin configuration when the native transform pipeline is enabled. This keeps Hermes compatibility policy in Rollipop config while letting the Rust transformer select the concrete preset.

```ts
// Rollipop config surface
runtimeTarget?: 'hermes' | 'hermes-v1';

// Native transformer options
return {
  envName: config.mode,
  runtimeTarget: resolveRuntimeTarget(config.runtimeTarget),
  flow: config.experimental.flow,
  worklets: resolveWorkletsConfig(config),
};
```

Inside the native transformer, the runtime target selects a preset of compatibility passes rather than relying on JS-side Babel/SWC preset assembly:

```rust
pub enum RuntimeTarget {
  Hermes,
  #[default]
  HermesV1,
}

match self.options.runtime_target {
  RuntimeTarget::HermesV1 => (
    hermes_regexp(RuntimeTarget::HermesV1),
    template_literal_caching(),
    async_arrow_non_simple_params(),
    super_in_object_accessor(),
    class_in_finally(),
    async_to_generator(async_to_generator::Config::default(), unresolved_mark),
    block_scoping(unresolved_mark),
  )
    .process(&mut program),
  RuntimeTarget::Hermes => (
    hermes_regexp(RuntimeTarget::Hermes),
    template_literal_caching(),
    static_blocks(),
    class_properties(hermes_class_properties_config(), unresolved_mark),
    private_in_object(),
    async_to_generator(async_to_generator::Config::default(), unresolved_mark),
    object_rest_spread(object_rest_spread::Config::default()),
    parameters(parameters::Config::default(), unresolved_mark),
    destructuring(destructuring::Config::default()),
    classes(classes::Config::default()),
    block_scoping(unresolved_mark),
  )
    .process(&mut program),
}
```

`@rollipop/jest-preset` is the concrete example. It replaces the React Native preset's `babel-jest` transformer with a Jest transformer backed by `RollipopReactNativeTransformer`, so test files go through the same native transform family used by Rollipop bundling. The goal is not only native performance; it is transformation consistency. Jest should observe code lowered with the same assumptions as the bundle, not a similar-but-separate transform stack.

## Persistent transform cache

Transform hooks are expensive: they can parse source, call JS plugins, run native transforms, chain sourcemaps, and update side-effect metadata. The hard fork therefore includes a persistent cache for transform hook results.

The cache exists to make unchanged modules cheap across rebuilds and process lifetimes. It also preserves the metadata Rolldown needs from transform hooks, so a cache hit can avoid rerunning the transform pipeline without losing module type or side-effect information.

Cache entries are isolated by a project-local cache directory and a hash id derived from the bundler setup. The cache lives under the project's `.rollipop/cache/<id>` directory, and `<id>` is derived from the Rollipop version plus build options and config fields that can affect transform output. Two projects or two incompatible transform configurations should not share transform results.

The native transform cache is file-system based and cache-first. The current fork keys transform results from the module id and original source code, so a source edit produces a different transform cache key and falls back to the transform pipeline. File modification time checks are used separately by the dev server for filesystem-backed bundle artifacts.

On the Rollipop side, the build id is intentionally based on transform-affecting inputs:

```ts
export function createId(config: ResolvedConfig, buildOptions: BuildOptions) {
  return md5(
    serialize([
      ROLLIPOP_VERSION,
      filterTransformAffectedOptions(buildOptions),
      filterTransformAffectedConfig(config),
    ]),
  );
}
```

The native plugin driver then places the filesystem cache under the project working directory and that id:

```rust
if options.persistent_cache {
  let cache_dir = options.cwd.join(".rollipop").join("cache").join(&options.id);
  meta.insert(Arc::new(TransformCache::new(cache_dir)));
}
```

The Rust transform cache path is intentionally simple: compute a stable key for the transform input, read from the cache before invoking transform hooks, and insert the transformed result after the hooks run. The snippet below is shortened to show that control flow.

```rust
let cache_key =
  transform_cache.as_ref().map(|_| xxh3_128(format!("{}\0{}", id, &original_code).as_bytes()));

if let (Some(cache), Some(key)) = (&transform_cache, cache_key) {
  if let Some(entry) = cache.get(key) {
    *sourcemap_chain = entry.sourcemap_chain;
    *side_effects = entry.side_effects;
    *module_type = entry.module_type;
    self.transform_cache_hit(id).await?;
    return Ok(entry.code);
  }
}

// after transform hooks run
if let (Some(cache), Some(key)) = (&transform_cache, cache_key) {
  cache.insert(key, TransformCacheEntry { code, sourcemap_chain, side_effects, module_type });
}
```

The mtime-based stale check is used by `FileSystemBundleStore`. It keeps the latest dev bundle on disk and reloads it only when the bundle file's modification time changes:

```ts
private holder: { code: string; mtimeMs: number };

const stats = fs.statSync(bundleFilePath);
this.holder = {
  code,
  mtimeMs: stats.mtimeMs,
};

private update() {
  const code = fs.readFileSync(this.bundleFilePath, { encoding: 'utf-8' });
  const stats = fs.statSync(this.bundleFilePath);
  this.holder = {
    code,
    mtimeMs: stats.mtimeMs,
  };
}

isStale() {
  return this.holder.mtimeMs !== fs.statSync(this.bundleFilePath).mtimeMs;
}
```

## HMR integration

The dev server adapts React Native device communication to a Rolldown-backed development engine. React Native clients should not need to know that Metro is not serving the graph.

React Native's default `HMRClient` module is implemented for Metro's runtime and server protocol. Rollipop replaces that module through a filtered plugin load hook that targets React Native's configured `react-native/Libraries/Utilities/HMRClient.js` path and returns Rollipop's own HMR client implementation. The replacement still follows the React Native `HMRClient` interface because the import surface must stay identical for React Native internals. Only the transport and runtime integration behind that surface are Rollipop-specific.

Rollipop also does not use Rolldown's default HMR runtime as-is. Rolldown's HMR plugin provides a default runtime around the global `__rolldown_runtime__`, but that runtime assumes a browser-like update transport. Rollipop passes its own runtime implementation into Rolldown dev mode, keeps the same global runtime slot, and adapts it to React Native's WebSocket client, evaluation path, reload behavior, and `import.meta.hot` contexts.

```ts
const config = {
  experimental: {
    devMode: {
      implement: '<Custom implementation>',
    },
  },
};
```

The Rollipop HMR client connects the React Native-side client module to the runtime:

```ts
if (globalThis.__rolldown_runtime__ != null) {
  globalThis.__rolldown_runtime__.setup(socket, origin);
}
```

The runtime itself subclasses `DevRuntime`, which is injected by Rolldown's HMR runtime, but installs a React Native-specific runtime instance:

```ts
declare const DevRuntime: typeof DefaultDevRuntime;

var BaseDevRuntime = DevRuntime;

class ReactNativeDevRuntime extends BaseDevRuntime {
  // React Native-specific messenger, evaluation, reload, and `import.meta.hot` behavior.
}

globalThis.__rolldown_runtime__ ??= new ReactNativeDevRuntime();
```

The native React Refresh wrapper plugin (`rollipopReactRefreshWrapperPlugin`) makes modules participate in HMR boundaries. It applies React Refresh handling and inserts `import.meta.hot` accept logic so refreshable modules are visible to the HMR runtime.

The design intent is to keep module graph invalidation and update generation in Rolldown while keeping React Native device protocol and runtime semantics in Rollipop.
