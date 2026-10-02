
## [1.0.0-alpha.33] - 2026-10-02

### 🚀 Features

- add react-native 0.87 support (#196) by @leegeunhyeok

### 🐛 Bug Fixes

- fetch dashboard data on demand by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- deps: bump concurrent-ruby from 1.3.3 to 1.3.7 in /examples/0.87 (#197) by @dependabot[bot]
- set `npmAlwaysAuth` to `false` by @leegeunhyeok


## [1.0.0-alpha.32] - 2026-10-01

### 🐛 Bug Fixes

- publish prereleases by channel by @leegeunhyeok
- preserve comments during init by @leegeunhyeok
- align custom sourcemap paths by @leegeunhyeok
- respect env overrides during expansion by @leegeunhyeok
- restrict asset access to workspace by @leegeunhyeok
- refresh dashboard on device disconnect by @leegeunhyeok

### 📚 Documentation

- clarify bundle defaults by @leegeunhyeok
- fix dynamic config commands by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- test on macOS by @leegeunhyeok


## [1.0.0-alpha.31] - 2026-10-01

### 🐛 Bug Fixes

- sync dashboard and devframe themes by @leegeunhyeok
- HMR log forwarding by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- deps: bump hono from 4.13.1 to 4.13.9 (#192) by @dependabot[bot]


## [1.0.0-alpha.30] - 2026-10-01

### 💥 BREAKING CHANGES

- flatten extra commands config by @leegeunhyeok
- remove `nativeTransformPipeline` option by @leegeunhyeok

### 🚀 Features

- enable native jest hoisting by @leegeunhyeok
- remove refresh button by @leegeunhyeok
- update custom commands separator by @leegeunhyeok
- print all logs for clients by @leegeunhyeok
- set `swc.native.externalHelpers` default to true by @leegeunhyeok
- support standalone transform rules by @leegeunhyeok
- add native swc configs by @leegeunhyeok
- remove connection id in hmr disconnected message by @leegeunhyeok
- integrate devframe devtools (#172) by @leegeunhyeok
- integrate dashboard with devframe (#164) by @leegeunhyeok

### 🐛 Bug Fixes

- enable MCP only when optional agentic peer is installed by @leegeunhyeok
- avoid rebuilding bundles on source map requests by @leegeunhyeok
- preserve queued devframe events by @leegeunhyeok
- close active connections before server shutdown by @leegeunhyeok
- preserve custom reporter events by @leegeunhyeok
- respect disabled hot updates by @leegeunhyeok
- reset transform rules between hot updates by @leegeunhyeok
- render production federated components by @leegeunhyeok
- keep stale bundle source maps invalid by @leegeunhyeok
- preserve configured output options by @leegeunhyeok
- propagate dev engine initialization failures by @leegeunhyeok
- isolate bundler options per build by @leegeunhyeok
- pass context when loading an explicit config file (#186) by @hautest
- forward dev server cache option to bundler pool by @leegeunhyeok
- handle extensionless resolution changes (#180) by @leegeunhyeok

### 🚜 Refactor

- remove unused internal state by @leegeunhyeok
- dev server logs by @leegeunhyeok

### ⚡ Performance

- dev: reduce resolution topology snapshot overhead by @leegeunhyeok
- register transform plugins when rules are exists by @leegeunhyeok
- rollipop: apply compile cache optimization by @leegeunhyeok

### 🧪 Testing

- synchronize native watcher assertions by @leegeunhyeok
- enable slient option by @leegeunhyeok
- add module semantics regression coverage by @leegeunhyeok
- fix resolution topology plugin tests by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- resolve dead code checks by @leegeunhyeok
- migrate to ts 7 by @leegeunhyeok
- deps: bump up packages by @leegeunhyeok
- deps: bump dompurify from 3.4.13 to 3.4.16 (#191) by @dependabot[bot]
- deps: bump next from 16.3.3 to 16.3.6 (#190) by @dependabot[bot]
- deps: bump brace-expansion from 1.1.18 to 1.1.21 (#189) by @dependabot[bot]
- bump up rolldown by @leegeunhyeok
- update commands usage by @leegeunhyeok
- deps: bump undici from 7.29.0 to 7.29.1 (#188) by @dependabot[bot]
- deps: bump fast-uri from 3.1.6 to 3.1.8 (#187) by @dependabot[bot]
- deps: bump image-size from 2.0.2 to 2.0.3 (#184) by @dependabot[bot]
- deps: bump baseline-browser-mapping from 2.10.10 to 2.11.22 (#182) by @dependabot[bot]
- deps-dev: bump vitest from 4.1.10 to 4.1.11 (#181) by @dependabot[bot]
- deps: bump joi from 17.13.4 to 17.13.7 (#178) by @dependabot[bot]
- deps: bump smol-toml from 1.7.0 to 1.8.0 (#177) by @dependabot[bot]
- deps: bump next from 16.2.11 to 16.3.3 (#176) by @dependabot[bot]
- deps: bump js-yaml from 3.15.1 to 3.15.2 (#175) by @dependabot[bot]
- record local rolldown verification build by @leegeunhyeok
- deps: bump @rollipop/rolldown to 1.0.30 by @leegeunhyeok
- deps: bump dependencies by @leegeunhyeok
- deps: bump svgo from 3.3.4 to 3.3.5 (#174) by @dependabot[bot]
- deps: bump browserslist from 4.28.1 to 4.28.8 (#173) by @dependabot[bot]
- deps: bump qs from 6.14.1 to 6.15.3 (#171) by @dependabot[bot]
- deps: bump fastify from 5.10.0 to 5.12.1 (#170) by @dependabot[bot]
- deps: bump fast-uri from 3.1.4 to 3.1.6 (#168) by @dependabot[bot]
- deps: bump postcss-selector-parser from 7.1.1 to 7.1.5 (#167) by @dependabot[bot]
- deps: bump devframe to 0.9.5 by @leegeunhyeok
- deps: bump nanoid from 3.3.17 to 3.3.18 (#165) by @dependabot[bot]
- deps: bump @hono/node-server from 1.19.14 to 1.19.17 (#163) by @dependabot[bot]
- deps: bump hono from 4.12.30 to 4.13.1 (#162) by @dependabot[bot]
- bump yarn to 4.18.0 by @leegeunhyeok
- fix yarn.lock by @leegeunhyeok
- deps: bump nanoid from 3.3.11 to 3.3.17 (#161) by @dependabot[bot]
- deps: bump js-yaml from 3.15.0 to 3.15.1 (#160) by @dependabot[bot]
- deps: bump brace-expansion from 1.1.16 to 1.1.18 (#159) by @dependabot[bot]
- deps: bump mermaid from 11.13.0 to 11.16.1 (#158) by @dependabot[bot]
- deps-dev: bump postcss from 8.5.18 to 8.5.23 (#157) by @dependabot[bot]
- deps: bump undici from 7.28.0 to 7.29.0 (#156) by @dependabot[bot]
- deps: bump fast-uri from 3.1.3 to 3.1.4 (#155) by @dependabot[bot]
- deps: bump @isaacs/brace-expansion from 5.0.0 to 5.0.1 (#154) by @dependabot[bot]
- deps: bump ajv from 8.17.1 to 8.18.0 (#151) by @dependabot[bot]
- deps: bump picomatch from 2.3.1 to 2.3.2 (#150) by @dependabot[bot]
- deps: bump yaml from 2.8.2 to 2.9.0 (#149) by @dependabot[bot]
- deps: bump joi from 17.13.3 to 17.13.4 (#148) by @dependabot[bot]
- deps: bump @hono/node-server from 1.19.12 to 1.19.14 (#147) by @dependabot[bot]
- deps: bump dompurify from 3.4.9 to 3.4.12 (#146) by @dependabot[bot]
- deps: bump js-yaml from 3.14.2 to 3.15.0 (#145) by @dependabot[bot]
- deps: bump svgo from 3.3.2 to 3.3.4 (#144) by @dependabot[bot]
- deps: bump tar from 7.5.16 to 7.5.20 (#142) by @dependabot[bot]
- deps: bump hono from 4.12.25 to 4.12.30 (#143) by @dependabot[bot]
- deps: bump shell-quote from 1.8.3 to 1.10.0 (#141) by @dependabot[bot]
- deps-dev: bump postcss from 8.5.8 to 8.5.18 (#140) by @dependabot[bot]
- deps-dev: bump react-router from 7.17.0 to 8.3.0 (#139) by @dependabot[bot]
- deps: bump json from 2.19.5 to 2.19.9 in /examples/0.84 (#137) by @dependabot[bot]


## [1.0.0-alpha.29] - 2026-07-25

### 💥 BREAKING CHANGES

- unify `rolldownOptions` override API by @leegeunhyeok
- revamp config surface (#132) by @leegeunhyeok

### 🚀 Features

- clear HMR updates when initializing the dev server by @leegeunhyeok
- update client HMR handling by @leegeunhyeok
- persist HMR patches for symbolication by @leegeunhyeok
- add HMR context guard by @leegeunhyeok
- support multi-runtime HMR by @leegeunhyeok
- add runtime bootstrap module by @leegeunhyeok
- inject metadata into bundle by @leegeunhyeok
- dashboard: fullscreen analyze report by @leegeunhyeok
- dashboard: show final rolldown options by @leegeunhyeok
- jest-preset: add glob import mock support by @leegeunhyeok
- expose sse types by @leegeunhyeok

### 🐛 Bug Fixes

- rewrite HMR sourcemap URLs to dev server URLs by @leegeunhyeok
- include transform options in cache id by @leegeunhyeok
- sync react refresh filters by @leegeunhyeok
- support PnP assets in dev server by @leegeunhyeok
- flush persisted build totals by @leegeunhyeok
- rewrite dev `sourceMappingURL` at bundle emit by @leegeunhyeok
- disable react refresh when hmr is off by @leegeunhyeok
- jest-preset: preset resolution by @leegeunhyeok

### 🚜 Refactor

- update file system bundle messages by @leegeunhyeok
- unify reporter events through shared event bus by @leegeunhyeok

### 📚 Documentation

- fix fmt by @leegeunhyeok
- update ARCHITECTURE.md by @leegeunhyeok
- add page description by @leegeunhyeok
- fix formatting by @leegeunhyeok
- add glob import and alias docs by @leegeunhyeok
- add agent guide by @leegeunhyeok

### ⚡ Performance

- reduce startup cost with dynamic imports by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- deps: bump packages by @leegeunhyeok
- deps: bump fast-uri from 3.1.0 to 3.1.3 (#136) by @dependabot[bot]
- deps: bump next from 16.2.6 to 16.2.11 (#135) by @dependabot[bot]
- deps: bump body-parser from 1.20.4 to 1.20.6 (#134) by @dependabot[bot]
- deps: bump brace-expansion from 1.1.12 to 1.1.16 (#133) by @dependabot[bot]
- format hmr runtime by @leegeunhyeok
- fix typescript compatibility (viteplus) by @leegeunhyeok
- deps: bump rolldown-analyzer@0.3.1 by @leegeunhyeok
- deps: bump up typescript@7 by @leegeunhyeok
- bump yarn to 4.17.1 by @leegeunhyeok
- avoid npm publish issue by @leegeunhyeok
- bump `@rollipop/rolldown` to 1.0.22 by @leegeunhyeok
- fmt by @leegeunhyeok
- remove experimental field by @leegeunhyeok
- setup knip by @leegeunhyeok
- plugin-rozenite: remove unused bin field by @leegeunhyeok


## [1.0.0-alpha.28] - 2026-07-02

### 🚀 Features

- use napi's `resetCache` instead by @leegeunhyeok
- align react-refresh transform targets by @leegeunhyeok
- improve alias config by @leegeunhyeok
- glob import (#129) by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- bump `@rollipop/rolldown` to 1.0.21 (#130) by @leegeunhyeok


## [1.0.0-alpha.27] - 2026-06-29

### 🚀 Features

- react compiler (#127) by @leegeunhyeok
- update 0.84 example app (#126) by @leegeunhyeok
- dashboard: migrate to `BrowserRouter` by @leegeunhyeok

### 🐛 Bug Fixes

- improve asset resolution (#125) by @leegeunhyeok
- improve symbolication compatibility (#124) by @leegeunhyeok

### 📚 Documentation

- update features by @leegeunhyeok
- add dashboard by @leegeunhyeok

### ⚡ Performance

- reduce dev server event overhead by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- fmt by @leegeunhyeok


## [1.0.0-alpha.26] - 2026-06-25

### ⚙️ Miscellaneous Tasks

- remove rolldown file by @leegeunhyeok
- skip title checking on release PR by @leegeunhyeok
- dashboard: remove private field by @leegeunhyeok


## [1.0.0-alpha.25] - 2026-06-25

### 🚀 Features

- add rollipop dev runtime and bump `@rollipop/rolldown` to 1.0.19 (#121) by @leegeunhyeok
- dashboard: implement dashboard and integrate with dev server (#120) by @leegeunhyeok
- add built-in analyzer by @leegeunhyeok
- dev-server: implement state APIs by @leegeunhyeok

### 🐛 Bug Fixes

- symbolicate fallback (#118) by @leegeunhyeok

### 🚜 Refactor

- consolidate file storage by @leegeunhyeok

### 📚 Documentation

- fix navbar spacing by @leegeunhyeok

### ⚙️ Miscellaneous Tasks

- deps: bump `@rollipop/rolldown` to 1.0.18 by @leegeunhyeok
- add check pr title action (#119) by @leegeunhyeok
- deps: bump concurrent-ruby from 1.3.3 to 1.3.7 in /examples/0.84 (#117) by @dependabot[bot]
- deps: bump concurrent-ruby from 1.3.3 to 1.3.7 in /examples/0.72 (#116) by @dependabot[bot]
- bump yarn to 4.17.0 by @leegeunhyeok
- deps: bump `@rollipop/rolldown` to 1.0.17 by @leegeunhyeok
- fmt package.json by @leegeunhyeok
- run fmt:fix after change versions by @leegeunhyeok


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
