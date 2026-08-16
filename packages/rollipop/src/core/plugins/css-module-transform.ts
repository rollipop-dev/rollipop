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
  // Marker appended to the generated JS module id so the `transform` hook can
  // tell a CSS file we already converted from a *raw* CSS file that needs
  // converting. Without this discriminator the `transform` hook would re-run on
  // our own JS output (which contains no `[.#]` selectors) and silently rewrite
  // `export default { foo: 'foo' }` into `export default {}` — dropping the
  // class-name map that React Native components import.
  const CONVERTED_MARKER = '?rollipop-css-module';

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
        let code = '';
        try {
          code = await fs.readFile(id, 'utf8');
        } catch {
          code = '';
        }
        const result = toJs(code, id);
        // Rewrite the resolved id to carry the conversion marker and re-key the
        // module as JS, so the downstream `transform` hook (which receives the
        // same id) can see it is already converted and skip it. The marker is
        // appended with a query string so the same file path resolves to the
        // same unique module and the original `.css` id is preserved for
        // debugging.
        return {
          ...result,
          moduleType: 'js',
          id: `${id}${CONVERTED_MARKER}`,
        };
      },
    },
    transform: {
      // Don't run on the rolldown runtime internals.
      filter: [ROLLDOWN_RUNTIME_EXCLUDE_FILTER],
      handler(_code, id) {
        // Skip modules we already converted in `load` (carried marker) and
        // anything that isn't a raw CSS file. This closes the double-transform
        // bug where the generated JS (which has no selectors) was re-emitted as
        // `export default {}`, destroying the class-name map.
        if (id.includes(CONVERTED_MARKER)) return;
        if (!isCss(id)) return;
        return;
      },
    },
  };
}

export { cssModuleTransform as cssModule };
