import * as rolldown from '@rollipop/rolldown';
import { exactRegex, id, include } from '@rollipop/rolldown/filter';
import dedent from 'dedent';

import {
  ROLLIPOP_VERSION,
  ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
  ROLLIPOP_VIRTUAL_ENTRY_ID,
  ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID,
} from '../../constants';
import { isExpoBundlerMode } from '../../expo/config-translator';

const VIRTUAL_ENTRY_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_ENTRY_ID)))];
const VIRTUAL_BOOTSTRAP_FILTER = [include(id(exactRegex(ROLLIPOP_VIRTUAL_BOOTSTRAP_ID)))];

export interface EntryPluginOptions {
  id: string;
  entryPath: string;
  preludePaths?: string[];
}

function entryPlugin(options: EntryPluginOptions): rolldown.Plugin[] {
  const { id, entryPath, preludePaths = [] } = options;

  const expoRouterManifestImport = isExpoBundlerMode()
    ? [ROLLIPOP_VIRTUAL_EXPO_ROUTER_MANIFEST_ID]
    : [];

  const importStatements = [
    // Bootstrap Rollipop runtime metadata before evaluating prelude and app modules.
    ROLLIPOP_VIRTUAL_BOOTSTRAP_ID,
    ...preludePaths,
    ...expoRouterManifestImport,
    entryPath,
  ]
    .map((modulePath) => `import ${JSON.stringify(modulePath)};`)
    .join('\n');

  // Absolute paths (project entry + react-native prelude) cannot be resolved by
  // Rolldown's default resolver when emitted from a *virtual* entry module, because
  // the virtual module has no filesystem location to anchor node_modules/relative
  // resolution. Intercept them here and treat them as already-resolved file paths.
  const resolvedModulePaths = new Set([entryPath, ...preludePaths]);

  const entryPlugin: rolldown.Plugin = {
    name: 'rollipop:entry',
    resolveId(source) {
      // The virtual entry id resolves to itself.
      if (source === ROLLIPOP_VIRTUAL_ENTRY_ID) {
        return { id: ROLLIPOP_VIRTUAL_ENTRY_ID };
      }
      // Absolute paths (project entry + react-native prelude) emitted into the
      // virtual entry cannot be resolved by Rolldown's default resolver (no
      // filesystem location to anchor from). Treat them as already-resolved file
      // imports. This hook must stay UNFILTERED so it runs for these imports
      // (filtered resolveId hooks are skipped for arbitrary module ids).
      if (resolvedModulePaths.has(source)) {
        return { id: source };
      }
      return null;
    },
    load: {
      filter: VIRTUAL_ENTRY_FILTER,
      handler() {
        return {
          code: importStatements,
          moduleType: 'js',
        };
      },
    },
  };

  const bootstrapPlugin: rolldown.Plugin = {
    name: 'rollipop:bootstrap',
    resolveId: {
      filter: VIRTUAL_BOOTSTRAP_FILTER,
      handler() {
        return ROLLIPOP_VIRTUAL_BOOTSTRAP_ID;
      },
    },
    load: {
      filter: VIRTUAL_BOOTSTRAP_FILTER,
      handler() {
        return {
          code: dedent`
          globalThis.__rollipop_meta__ = globalThis.__rollipop_meta__ || {};
          globalThis.__rollipop_meta__[${JSON.stringify(id)}] = {
            version: ${JSON.stringify(ROLLIPOP_VERSION)},
          };
          // Metro-compatibility shim for \`require.context(...)\` used by Expo Router
          // (and other Metro-era libraries). Rollipop pre-bundles the entire module
          // graph, so the context enumerates the already-registered modules lazily.
          // The runtime entry factory exposes \`__rollipop_require__\` as the 4th arg,
          // and the module registry lives on \`__rollipop_require__.m\`.
          if (!__rollipop_require__.context) {
            __rollipop_require__.context = function (rootDir, recursive, regExp, mode) {
              var modules = __rollipop_require__.m;
              // Module ids in the registry are relative to the project root
              // (e.g. "app/index.tsx"). The context rootDir (EXPO_ROUTER_APP_ROOT)
              // is an absolute path like ".../example-app/app", whose
              // project-relative prefix is its last path segment ("app"). Only
              // module ids that live under that prefix are route files; everything
              // else (e.g. the app entry "index.js" at the project root) must be
              // excluded so it isn't mistaken for a route.
              var rootBase = rootDir ? rootDir.replace(/[/\\]$/, '').split(/[/\\]/).pop() : '';
              var normalize = function (id) {
                if (rootBase && id.indexOf(rootBase + '/') === 0) {
                  id = id.slice(rootBase.length + 1);
                } else {
                  // Not under the context root: return a sentinel that can never
                  // match the route regex, so it is filtered out.
                  return '\u0000' + id;
                }
                if (id.charAt(0) !== '.' && id.charAt(0) !== '/') {
                  id = './' + id;
                }
                return id;
              };
              // Map a "./"-prefixed context key back to the registered module id.
              // Context keys are relative to rootDir (e.g. "./index.tsx"), while
              // the registered module ids are relative to the project root
              // (e.g. "app/index.tsx"). Re-prepend the rootBase prefix so the key
              // resolves to the actual, registered module.
              var toModuleId = function (key) {
                if (key.indexOf('./') === 0) key = key.slice(2);
                if (rootBase && key.indexOf(rootBase + '/') !== 0) {
                  key = rootBase + '/' + key;
                }
                return key;
              };
              var makeContext = function () {
                var getKeys = function () {
                  return Object.keys(modules).filter(function (id) {
                    return regExp.test(normalize(id));
                  }).map(normalize);
                };
                var ctx = function (key) {
                  var mid = toModuleId(key);
                  var mod = __rollipop_require__(mid);
                  return mod;
                };
                ctx.keys = function () { return getKeys(); };
                ctx.id = function (key) { return key; };
                ctx.resolve = function (key) { return toModuleId(key); };
                ctx.load = function (key) {
                  return Promise.resolve(ctx(key));
                };
                ctx.loadAsync = ctx.load;
                return ctx;
              };
              return makeContext();
            };
          }
          // When code splitting is disabled (dev server single-bundle mode), every
          // module is inlined into the module registry. Rollipop still externalizes
          // certain packages (e.g. expo-modules-core) and emits
          // require.e("expo-modules-core") with a bare specifier. The base runtime
          // defines require.e to throw (it expects a dev-client chunk bridge).
          // Override it to resolve the bare external specifier to the inlined module
          // and return its namespace, matching require.t's expectations.
          // Make Object.defineProperty on the global object tolerant of redefining an already
          // defined non-configurable property with an equivalent value. Rollipop's
          // dev bundle can include duplicate module copies (e.g. the Fusebox React
          // DevTools dispatcher) that both do
          // Object.defineProperty(global, '__X__', { configurable: false }), and the
          // second call throws "property is not writable". Since these are global
          // singletons, a no-op redefinition is correct.
          var __rollipop_defineProperty = Object.defineProperty;
          Object.defineProperty = function (obj, prop, desc) {
            // Rollipop's dev bundle can include duplicate module copies (e.g. the
            // Fusebox React DevTools dispatcher) that both do
            // Object.defineProperty(global, '__X__', { configurable: false }). The
            // second call throws "property is not writable" because the first made
            // the property non-configurable. Since these are global singletons, keep
            // the first definition and skip the redundant one.
            if (obj === globalThis && Object.prototype.hasOwnProperty.call(obj, prop)) {
              var existing = Object.getOwnPropertyDescriptor(obj, prop);
              if (existing && !existing.configurable) {
                return obj;
              }
            }
            return __rollipop_defineProperty.call(this, obj, prop, desc);
          };

          // Expo Router registers the app entry via React.startTransition(cb). In
          // production React, startTransition DEFERS cb until a microtask, so the
          // native side's runApplication("main") fires before "main" is
          // registered -> "App entry not found". Force startTransition to run
          // synchronously so registration beats runApplication. This is safe now
          // that rollipop dedupes react to a single instance (the renderer and
          // the app share one ReactSharedInternals / dispatcher), so running cb
          // synchronously does not corrupt hook dispatch.
          try {
            var __rollipop_react = __rollipop_require__('react');
            if (__rollipop_react && typeof __rollipop_react.startTransition === 'function') {
              __rollipop_react.startTransition = function (cb) {
                if (typeof cb === 'function') cb();
              };
            }
          } catch (e) {}

          // Remove the dev-only LogBox overlay during automated e2e.
          // RN 0.86's LogBox close-icon renders <Image>, and rollipop's RN 0.86
          // interop leaves that component throwing "undefined is not a function"
          // (a self-referential default-export interop bug in resolveAssetSource).
          // LogBox then loops: error -> show -> icon throws -> error, keeping its
          // full-screen overlay up and swallowing every touch on the app beneath.
          // The app itself has no errors, so uninstalling LogBox just removes the
          // broken dev overlay and lets touches reach the real UI.
          // NOTE: RN 0.86 re-calls LogBox.install() during app setup, which would
          // re-mount the overlay after we uninstall it. Neutralize install() too
          // so it cannot come back.
          try {
            var __rollipop_rn = __rollipop_require__('react-native');
            if (__rollipop_rn && __rollipop_rn.LogBox && typeof __rollipop_rn.LogBox.uninstall === 'function') {
              __rollipop_rn.LogBox.uninstall();
            }
          } catch (e) {}
          try {
            var __rollipop_logbox_mod = __rollipop_require__.e('react-native/Libraries/LogBox/LogBox');
            var __rollipop_logbox_cls = __rollipop_logbox_mod && (__rollipop_logbox_mod.default || __rollipop_logbox_mod);
            if (__rollipop_logbox_cls) {
              __rollipop_logbox_cls.install = function () {};
              if (typeof __rollipop_logbox_cls.uninstall === 'function') {
                __rollipop_logbox_cls.uninstall();
              }
            }
          } catch (e) {}

          __rollipop_require__.e = function (specifier) {
            var modules = __rollipop_require__.m;
            if (typeof specifier === 'string') {
              if (modules[specifier]) {
                return __rollipop_require__(specifier);
              }
              var keys = Object.keys(modules);
              // Prefer the package entry (e.g. .../expo-modules-core/build/index.js)
              // over leaf modules that merely contain the specifier in their path.
              var entryKey = null;
              var anyKey = null;
              for (var i = 0; i < keys.length; i++) {
                var key = keys[i];
                if (key.indexOf(specifier) === -1) continue;
                if (anyKey == null) anyKey = key;
                if (
                  key.indexOf('/' + specifier + '/build/index.js') !== -1 ||
                  key.indexOf('/' + specifier + '/index.js') !== -1 ||
                  key.indexOf('/' + specifier + '/src/index.js') !== -1
                ) {
                  entryKey = key;
                  break;
                }
              }
              var resolved = entryKey != null ? entryKey : anyKey;
              if (resolved != null) {
                return __rollipop_require__(resolved);
              }
            }
            return __rollipop_require__(specifier);
          };
          `,
          moduleType: 'js',
        };
      },
    },
  };

  return [entryPlugin, bootstrapPlugin];
}

export { entryPlugin as entry };
