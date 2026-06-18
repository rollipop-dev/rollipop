
## [1.0.0-alpha.24] - 2026-06-18

### 🚀 Features

- add skills command by @leegeunhyeok
- add `withTransform` option to polyfill config by @leegeunhyeok
- store hmr chunk by @leegeunhyeok
- support `rollipop` format (#101) by @leegeunhyeok

### 🐛 Bug Fixes

- add `minify` as affected option field by @leegeunhyeok
- invalid `import.meta.hot` value when hmr disabled by @leegeunhyeok
- build progress total cache (#103) by @leegeunhyeok
- resolve bundle entry file paths (#102) by @leegeunhyeok
- preserve prelude order without strict execution (#99) by @leegeunhyeok

### 🚜 Refactor

- add ident by @leegeunhyeok

### 📚 Documentation

- update troubleshooting.mdx by @leegeunhyeok
- fix sidebar styles by @leegeunhyeok
- update main title by @leegeunhyeok
- add ARCHITECTURE.md by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- deps: bump next from 16.2.1 to 16.2.6 (#114) by @dependabot[bot]
- renew release pipeline by @leegeunhyeok
- deps: bump ws from 6.2.3 to 8.21.0 (#109) by @dependabot[bot]
- deps: bump hono from 4.12.10 to 4.12.25 (#108) by @dependabot[bot]
- deps: bump dompurify from 3.3.3 to 3.4.9 (#107) by @dependabot[bot]
- deps: bump launch-editor from 2.12.0 to 2.14.1 (#106) by @dependabot[bot]
- deps-dev: bump @babel/core from 7.29.0 to 7.29.6 (#105) by @dependabot[bot]
- deps: bump tar from 7.5.2 to 7.5.16 (#104) by @dependabot[bot]
- bump rolldown to 1.0.14 by @leegeunhyeok
- update repository links by @leegeunhyeok
- add issue templates by @leegeunhyeok

## [1.0.0-alpha.23] - 2026-06-12

### 🚀 Features

- impl mcp tools (#97) by @leegeunhyeok

### 🐛 Bug Fixes

- HMR transform progress count by @leegeunhyeok

### 🚜 Refactor

- use native magic string instead by @leegeunhyeok
- add revision state by @leegeunhyeok

### ⚡ Performance

- limit prelude transform to entry module by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump dependencies and drop cjs by @leegeunhyeok
- bump yarn to 4.16.0 by @leegeunhyeok
- bump rolldown to 1.0.12 by @leegeunhyeok

## [1.0.0-alpha.22] - 2026-06-04

### 🚀 Features

- track transform cache hits in progress (#96) by @leegeunhyeok

### 🐛 Bug Fixes

- reset HMR rebuild progress totals by @leegeunhyeok
- bundle sourcemap output (#95) by @jingjing2222

### 🚜 Refactor

- centralize dev server events (#92) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump rolldown to 1.0.11 by @leegeunhyeok
- bump rolldown to 1.0.9 by @leegeunhyeok

## [1.0.0-alpha.21] - 2026-05-28

### 🚀 Features

- add agent guide command (#89) by @leegeunhyeok
- jest-preset: add @rollipop/jest-preset (#86) by @leegeunhyeok
- add envFile option for env file basename (#84) by @leegeunhyeok

### 🐛 Bug Fixes

- expose native flow config (#90) by @leegeunhyeok
- resolve React Native alias fields by default (#88) by @leegeunhyeok
- support non-image assets without dimensions (#87) by @leegeunhyeok

### 🧪 Testing

- stabilize dev server e2e (#91) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump @rollipop/rolldown to 1.0.8 by @leegeunhyeok
- bump `@rollipop/rolldown` to 1.0.5 by @leegeunhyeok

## [0.1.0-alpha.20] - 2026-05-21

### 🚀 Features

- module federation (#79) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump @rollipop/rolldown to 1.0.2 (#83) by @leegeunhyeok

## [0.1.0-alpha.19] - 2026-05-17

### 🐛 Bug Fixes

- emit sourcemap sources relative to project root (#77) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump @rollipop/rolldown to 1.0.1 (#81) by @leegeunhyeok

## [0.1.0-alpha.18] - 2026-05-06

### 🚀 Features

- impl svg plugin (#75) by @leegeunhyeok
- setup react-native@0.72 example (#74) by @leegeunhyeok
- add `experimental.nativeTransformPipeline` option (#73) by @leegeunhyeok
- native transform pipeline (#72) by @leegeunhyeok
- add `runtimeTarget` to support legacy hermes runtimes (#69) by @leegeunhyeok

### 🐛 Bug Fixes

- test: align global identifier assertion with constant (#70) by @leegeunhyeok
- invalid global identifier by @leegeunhyeok

### 🚜 Refactor

- internal config types by @leegeunhyeok
- transformer options merge util by @leegeunhyeok
- global bindings by @leegeunhyeok

### 📚 Documentation

- update by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- trigger changeset by @leegeunhyeok
- bump up rolldown by @leegeunhyeok
- bump up yarn to 4.14.1 by @leegeunhyeok
- bump version up rolldown by @leegeunhyeok
- deps: bump typescript to 6.0.3 (#71) by @leegeunhyeok

## [0.1.0-alpha.17] - 2026-04-24

### 🐛 Bug Fixes

- pkg: include src/runtime/hmr-client.ts in the published tarball (#67) by @leegeunhyeok

## [0.1.0-alpha.16] - 2026-04-24

### 🚀 Features

- server: GET /bundlers/:id/status returns bundler lifecycle state (#65) by @leegeunhyeok
- server: add MCP server for LLM agent integration (#60) by @leegeunhyeok
- server: add SSE event stream, control API, and documentation (#59) by @leegeunhyeok
- improve `assetRegistryPath`, `hmrClientPath` options by @leegeunhyeok

### 🐛 Bug Fixes

- server: remove duplicate `hmr:update-done` message in HMR patch updates (#58) by @leegeunhyeok
- core: return cached instance from `FileStorage.getInstance()` (#56) by @leegeunhyeok
- docs: remove `bash` language identifier from package manager command blocks (#53) by @leegeunhyeok
- docs: align 404 page layout with home and add page title (#51) by @leegeunhyeok

### 🚜 Refactor

- server: drop the dead FileSystemCache class (#66) by @leegeunhyeok
- expose builtin plugins via rollipop/plugins sub-path (#64) by @leegeunhyeok
- server: always use fs bundle store, drop BUNDLE_STORE env (#61) by @leegeunhyeok

### 📚 Documentation

- sse: fix incorrect bundler ID examples and remove Bundler ID section by @leegeunhyeok
- add llms.txt (#54) by @leegeunhyeok
- add features (#50) by @leegeunhyeok

### 🧪 Testing

- server: add Node runtime e2e harness (lifecycle + HMR) (#63) by @leegeunhyeok
- add unit tests for core modules (#57) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- remove submodules by @leegeunhyeok
- migrate toolchain to Vite+ (#52) by @leegeunhyeok
- bump version up deps by @leegeunhyeok
- bump version up `@rollipop/rolldown` by @leegeunhyeok

## [0.1.0-alpha.15] - 2026-03-25

### 🚀 Features

- migrate to `fast-flow-transform` by @leegeunhyeok
- add symbolicate log (#46) by @leegeunhyeok
- use `env` instead of `jsc.target` by @leegeunhyeok
- migrate to `fast-flow-transform` by @leegeunhyeok

### 🐛 Bug Fixes

- rollback to `flow-remove-types` by @leegeunhyeok

### 🚜 Refactor

- init: update commands instead of patching script (#49) by @leegeunhyeok

### 📚 Documentation

- update deps (#48) by @leegeunhyeok

### ⚡ Performance

- migrate to native bindings (#44) by @leegeunhyeok

### 🧪 Testing

- add comprehensive e2e test suite (#47) by @leegeunhyeok

## [0.1.0-alpha.14] - 2026-03-19

### 🚀 Features

- add `devMode.useFileSystemBundle` for raw bundle debugging (#43) by @leegeunhyeok
- enable `externalHelpers` for reduce bundle size by @leegeunhyeok

### 🚜 Refactor

- move `devMode.useFileSystemBundle` option to `BUNDLE_STORE` env by @leegeunhyeok
- remove unnecessary hook by @leegeunhyeok
- import `TransformOptions` from utils subpath by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up `@rollipop/rolldown` by @leegeunhyeok
- fmt by @leegeunhyeok
- deps: bump version up by @leegeunhyeok

## [0.1.0-alpha.13] - 2026-03-06

### 🚀 Features

- plugin-rozenite: export plugin options by @leegeunhyeok
- plugin-analyze: impl (#41) by @leegeunhyeok
- plugin-rozenite: impl (#40) by @leegeunhyeok
- esm only by @leegeunhyeok

### 🐛 Bug Fixes

- CJS compatibility for `react-native.config.js` by @leegeunhyeok
- tsdown's `inlineOnly` warnings by @leegeunhyeok

### 🚜 Refactor

- resolve `url.parse()` deprecation warning (DEP0169) by @leegeunhyeok
- fix lint by @leegeunhyeok
- use `ClientLogReporter` as internal reporter by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- update changeset config by @leegeunhyeok
- disable `checks.pluginTimings` by @leegeunhyeok
- bump up react-native to 0.84.1 by @leegeunhyeok
- fix peer requirements by @leegeunhyeok
- node: bump up node to 24 LTS by @leegeunhyeok
- update deps by @leegeunhyeok
- bump version up `@rollipop/rolldown` by @leegeunhyeok
- bump version up dependencies by @leegeunhyeok
- migrate to `@oxc-node/core` by @leegeunhyeok
- remove unused code by @leegeunhyeok

## [0.1.0-alpha.12] - 2026-01-31

### 🚀 Features

- add `optimization.lazyBarrel` option by @leegeunhyeok

### 🚜 Refactor

- replace `statue` plugin to `reporter` plugin by @leegeunhyeok
- replace deprecated `inlineDynamicImports` option by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up `@rollipop/rolldown` by @leegeunhyeok

## [0.1.0-alpha.11] - 2026-01-26

### 🚀 Features

- expose more rolldown config options by @leegeunhyeok

### 🐛 Bug Fixes

- `@fastify/middie` extension types by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up `@rollipop/rolldown` by @leegeunhyeok
- oxfmt by @leegeunhyeok

## [0.1.0-alpha.10] - 2026-01-20

### 🚀 Features

- add env for override default react-native path by @leegeunhyeok

### 🐛 Bug Fixes

- default `dev` option by @leegeunhyeok
- remove `BASE_URL` when non-dev server mode by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up `@rollipop/rolldown` by @leegeunhyeok
- add tag for publish by @leegeunhyeok
- add custom version publish flow by @leegeunhyeok
- track `@rollipop/rolldown@0.0.0-beta.2` by @leegeunhyeok

## [0.1.0-alpha.9] - 2026-01-15

### 🚀 Features

- expose dev runtime types by @leegeunhyeok
- noop in `onHmrUpdates` when hmr is disabled by @leegeunhyeok
- add built-in constant environment variables by @leegeunhyeok
- update default `dev` option by @leegeunhyeok

### 📚 Documentation

- update `defineConfig` by @leegeunhyeok
- remove unnecessary text by @leegeunhyeok
- add environment variable by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up `@rollipo/rolldown` by @leegeunhyeok
- esm only by @leegeunhyeok

## [0.1.0-alpha.8] - 2026-01-14

### 🚀 Features

- migrate to `@rollipop/rolldown` (#33) by @leegeunhyeok
- hmr: improve compatibility for lower runtime versions (#31) by @leegeunhyeok
- add React Native CLI compatible commands (#30) by @leegeunhyeok

### 📚 Documentation

- update by @leegeunhyeok

### ⚡ Performance

- fix hermes performance degradation issue (#34) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up packages by @leegeunhyeok
- update comment by @leegeunhyeok

## [0.1.0-alpha.7] - 2026-01-11

### 🚀 Features

- improve server errors (#29) by @leegeunhyeok
- handle cli actions (#28) by @leegeunhyeok
- add `devServer` to `InteractiveCommandContext` by @leegeunhyeok
- implement deferred caching with batch flush (#27) by @leegeunhyeok
- add dotenv-based environment variable loading (#26) by @leegeunhyeok
- cli: add `terminal.extraCommands` for supports custom commands (#25) by @leegeunhyeok
- exclude `watch` from `DevEngineOptions` by @leegeunhyeok

### 🐛 Bug Fixes

- hmr: resolve HMR not working when cache is enabled (#23) by @leegeunhyeok

### 🚜 Refactor

- cli progress bar by @leegeunhyeok

### ⚡ Performance

- optimize plugin matching using bitmask comparison by @leegeunhyeok

## [0.1.0-alpha.6] - 2026-01-08

### 🚀 Features

- use `enqueueUpdate` instead of `performReactRefresh` by @leegeunhyeok

## [0.1.0-alpha.5] - 2026-01-08

### 🚀 Features

- update `filterTransformAffectedConfig` by @leegeunhyeok
- add `devMode` config by @leegeunhyeok
- use hashed id only by @leegeunhyeok
- support `rolldown.RolldownPluginOption` style api by @leegeunhyeok
- transform runtime source to es5 by @leegeunhyeok
- expose cli utils by @leegeunhyeok
- update default `mainFields` by @leegeunhyeok
- json: cjs compatibility by @leegeunhyeok
- use `viteJsonPlugin` instead by @leegeunhyeok
- add `none` option to `terminal.status` by @leegeunhyeok
- add `transformer.babel`, `transformer.swc` configs (#20) by @leegeunhyeok
- add websocket parameter to `HMRCustomHandler` (#18) by @leegeunhyeok
- allow `TopLevelFilterExpression` and expose `/pluginutils` subpath (#17) by @leegeunhyeok
- add HMR runtime context-based web socket communication (#16) by @leegeunhyeok

### 🐛 Bug Fixes

- ensure build options for devEngine by @leegeunhyeok
- auto open debugger when settings is enabled by @leegeunhyeok
- fix: generate id only from transform-affecting configurations by @leegeunhyeok

### 🚜 Refactor

- convert `hmr-client` to esm by @leegeunhyeok
- re-export instead of wrap with namespace by @leegeunhyeok
- event emitter based dev server instance by @leegeunhyeok
- rename to hermes-syntax-aware by @leegeunhyeok
- combine packages by @leegeunhyeok

### 📚 Documentation

- fix get started link by @leegeunhyeok
- fix ci workflow by @leegeunhyeok
- setup (#15) by @leegeunhyeok

### 🧪 Testing

- fix unit tests by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump version up rolldown by @leegeunhyeok
- fix logo by @leegeunhyeok

## [0.1.0-alpha.4] - 2025-12-25

### ⚙️ Miscellaneous Tasks

- publish by @leegeunhyeok

## [0.1.0-alpha.3] - 2025-12-25

### ⚙️ Miscellaneous Tasks

- oidc by @leegeunhyeok

## [0.1.0-alpha.2] - 2025-12-25

### 🚀 Features

- bind context to Rollipop-specific hooks (#12) by @leegeunhyeok
- supports custom HMR handler (#10) by @leegeunhyeok
- improve `configureServer` plugin hook (#9) by @leegeunhyeok
- add `configureServer` (#8) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- typo by @leegeunhyeok
- release by @leegeunhyeok

## [0.1.0-alpha.1] - 2025-12-23

### 🚀 Features

- add `config` and `configResolved` (#7) by @leegeunhyeok
- bump version up rolldown and remove hmr-shims by @leegeunhyeok

### 🐛 Bug Fixes

- core: fix: ensure valid source mapping information is included (#5) by @leegeunhyeok
- bundle command by @leegeunhyeok

### 🚜 Refactor

- remove unused dev runtime member by @leegeunhyeok
- rename to rollipop by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- add comments to config types by @leegeunhyeok
- add `--tolerate-republish` flag by @leegeunhyeok
- add commit option by @leegeunhyeok

## [0.1.0-alpha.0] - 2025-12-22

### 🚀 Features

- impl svg plugin by @leegeunhyeok
- sending hmr udpate events by @leegeunhyeok
- resolving assets by @leegeunhyeok
- impl symbolicate by @leegeunhyeok
- supports multipart/mixed response by @leegeunhyeok
- cli integration by @leegeunhyeok
- reorganize package structure by @leegeunhyeok
- improve status progress by @leegeunhyeok
- interactive mode by @leegeunhyeok
- hmr by @leegeunhyeok
- add wss by @leegeunhyeok
- add progress bar by @leegeunhyeok
- add `@rollipop/dev-server` by @leegeunhyeok
- add logger by @leegeunhyeok
- add `@rollipop/common` by @leegeunhyeok
- add `@rollipop/cli` by @leegeunhyeok
- cache hits by @leegeunhyeok
- impl persistent cache by @leegeunhyeok
- improve codegen condition by @leegeunhyeok
- add logo by @leegeunhyeok
- override rolldown config by @leegeunhyeok
- config by @leegeunhyeok
- impl by @leegeunhyeok

### 🐛 Bug Fixes

- avoid swc errors by @leegeunhyeok
- cache plugin excution order by @leegeunhyeok
- progress bar layout by @leegeunhyeok
- invalid ident name by @leegeunhyeok
- react dev runtime by @leegeunhyeok

### 🚜 Refactor

- plugin utils by @leegeunhyeok
- module paths by @leegeunhyeok

### 📚 Documentation

- update README.md by @leegeunhyeok

### 🧪 Testing

- add some unit tests by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- prepack by @leegeunhyeok
- add changeset by @leegeunhyeok
- add default value by @leegeunhyeok
- setup by @leegeunhyeok
- rename rolldown internal option by @leegeunhyeok
- update example app by @leegeunhyeok
- udpate cli path by @leegeunhyeok
- remove warning log by @leegeunhyeok
- rename package name by @leegeunhyeok
- oxfmt by @leegeunhyeok
