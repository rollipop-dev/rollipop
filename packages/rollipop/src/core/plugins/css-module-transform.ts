import type * as rolldown from '@rollipop/rolldown';

import { ROLLDOWN_RUNTIME_EXCLUDE_FILTER } from './shared/filters';

/**
 * Minimal CSS-Modules transform for React Native / Expo.
 *
 * Metro ships a CSS-module transform that turns `*.module.css` into a JS module
 * exporting a map of local class names to their (usually identical) runtime
 * strings, which React Native components consume as plain style identifiers.
 * `@rollipop/rolldown` no longer bundles CSS, so without this plugin any
 * `.module.css` (e.g. `@expo/log-box`'s overlays, pulled in by the Expo Dev
 * Client error overlay) makes the build fail with
 * `[UNSUPPORTED_FEATURE] Bundling CSS is no longer supported`.
 *
 * This plugin converts CSS modules to their JS interop form:
 *   - `*.module.css` -> `export default { localName: 'localName', ... }` plus
 *     named exports, matching the `import styles from './x.module.css'` usage.
 *   - plain `*.css` -> `export default {}` (the CSS text is discarded; RN
 *     native has no use for raw stylesheet rules, and the class names are the
 *     only thing the JS side references).
 *
 * It extracts simple `.class` / `#id` selectors. Complex `:host` / `@media` /
 * nesting blocks are skipped for name collection — they contribute no local
 * class names the JS imports.
 */
function cssModuleTransform(): rolldown.Plugin {
  const isModuleCss = (id: string) => /\.module\.css(\?.*)?$/.test(id);
  const isCss = (id: string) => /\.css(\?.*)?$/.test(id);

  // Collect local class / id names from CSS source. We only care about
  // top-level `.foo` / `#foo` selectors; pseudo-classes and at-rules carry no
  // importable names.
  const collectNames = (code: string): string[] => {
    const names = new Set<string>();
    const selectorRe = /[.#]([A-Za-z_][A-Za-z0-9_-]*)/g;
    let match: RegExpExecArray | null;
    while ((match = selectorRe.exec(code)) !== null) {
      names.add(match[1]);
    }
    return [...names];
  };

  const toJs = (code: string, id: string): { code: string; moduleType: 'js' } => {
    if (!isModuleCss(id)) {
      // Plain CSS: nothing the JS side can use on native — discard.
      return { code: 'export default {};\n', moduleType: 'js' };
    }
    const ordered = collectNames(code);
    const defaultExport =
      'export default {\n' +
      ordered.map((name) => `  ${JSON.stringify(name)}: ${JSON.stringify(name)},`).join('\n') +
      '\n};\n';
    const namedExports = ordered
      .map((name) => `export const ${name} = ${JSON.stringify(name)};`)
      .join('\n');
    return {
      code: `${defaultExport}${namedExports ? `${namedExports}\n` : ''}`,
      moduleType: 'js',
    };
  };

  return {
    name: 'rollipop:css-module-transform',
    // `load` runs before rolldown assigns a module type, so returning JS with
    // `moduleType: 'js'` bypasses rolldown's (removed) native CSS pipeline for
    // both `rolldown.build()` and the dev-server `dev()` API. Without this,
    // `.module.css` triggers `[UNSUPPORTED_FEATURE] Bundling CSS is no longer
    // supported`.
    load: {
      filter: [ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      async handler(id) {
        // Only intercept CSS; let everything else fall through to normal load.
        if (!isCss(id)) return;
        // Read the file ourselves so we don't depend on rolldown having already
        // loaded it as CSS.
        const fs = await import('node:fs/promises');
        try {
          const code = await fs.readFile(id, 'utf8');
          return toJs(code, id);
        } catch {
          return toJs('', id);
        }
      },
    },
    transform: {
      // Don't run on the rolldown runtime internals.
      filter: [ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      handler(code, id) {
        // Guard: if a CSS file reaches here as a JS module, re-emit the interop
        // form (covers cases where `load` was skipped, e.g. virtual modules).
        if (!isCss(id)) {
          return;
        }
        return toJs(code, id);
      },
    },
  };
}

export { cssModuleTransform as cssModule };
