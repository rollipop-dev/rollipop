import type * as rolldown from '@rollipop/rolldown';
import { id, include } from '@rollipop/rolldown/filter';

/**
 * Fix the `@rollipop/rolldown` `rollipop` output-format interop bug for
 * `react-native/Libraries/Image/resolveAssetSource.js`.
 *
 * That module does:
 *
 *   function resolveAssetSource(source) { ... }
 *   resolveAssetSource.pickScale = pickScale;
 *   resolveAssetSource.setCustomSourceTransformer = setCustomSourceTransformer;
 *   resolveAssetSource.addCustomSourceTransformer = addCustomSourceTransformer;
 *   export default resolveAssetSource;
 *
 * Because the module both `export default`s `resolveAssetSource` AND mutates
 * that same default export's properties afterwards, the `rollipop` format
 * treats the mutation as a read/write of the module's own default. It emits a
 * self-referential import (`var self = require("…/resolveAssetSource.js")`)
 * and binds `export default` to `self.default`, which is circular and
 * `undefined` at evaluation time. Worse, the circular self-reference causes
 * Rolldown to drop the module body entirely, so the `resolveAssetSource`
 * function is missing from the bundle — any `resolveAssetSource(...)` call
 * then throws "undefined is not a function" (and `Image` crashes).
 *
 * The fix rewrites the source *before* Rolldown sees it: the implementation is
 * kept under a private name and the exported default becomes a separate const
 * wrapper that is never mutated after it is exported. That breaks the
 * self-reference, so Rolldown preserves the body and emits a correct, non-circular
 * default export:
 *
 *   function _resolveAssetSourceImpl(source) { ... }
 *   const resolveAssetSource = Object.assign(_resolveAssetSourceImpl, {
 *     pickScale,
 *     setCustomSourceTransformer,
 *     addCustomSourceTransformer,
 *   });
 *   export default resolveAssetSource;
 *
 * This version is resilient to whitespace and to the *order* of the property
 * mutations (it collects every `resolveAssetSource.<prop> = <prop>;` assignment
 * rather than matching one exact block), so an RN bump that reorders or rewraps
 * the assignments still produces a correct shim.
 *
 * NOTE: this is a stop-gap at the Rollipop layer. The proper fix belongs in the
 * `@rollipop/rolldown` format plugin (the self-referential default interop).
 * Until that is fixed, we keep this shim — but if the module shape drifts so far
 * that neither the function nor `export default resolveAssetSource` is present,
 * we emit a loud warning instead of silently no-op'ing (a silent no-op would
 * resurrect the dropped-body crash with no diagnosability).
 */
const RESOLVE_ASSET_SOURCE_FILTER = [include(id(new RegExp('resolveAssetSource\\.js$')))];

// A single `resolveAssetSource.<prop> = <prop>;` mutation, captured by prop name.
// Tolerant of spacing/whitespace changes between the tokens.
const MUTATION_LINE_RE = /resolveAssetSource\.(\w+)\s*=\s*(\w+)\s*;/g;
// The exact default export line.
const DEFAULT_EXPORT_RE = /export\s+default\s+resolveAssetSource\s*;/;

function selfRefDefaultInteropPlugin(): rolldown.Plugin | null {
  return {
    name: 'rollipop:resolve-asset-source-interop',
    transform: {
      filter: RESOLVE_ASSET_SOURCE_FILTER,
      handler(this: rolldown.PluginContext, code: string) {
        // Not the module we care about (e.g. expo-asset's copy) — skip.
        if (!code.includes('export default resolveAssetSource;')) {
          return null;
        }

        const hasFunction = /function\s+resolveAssetSource\s*\(/.test(code);
        const defaultExportMatch = DEFAULT_EXPORT_RE.exec(code);

        if (!hasFunction || !defaultExportMatch) {
          const warn = typeof this?.warn === 'function' ? this.warn.bind(this) : console.warn;
          warn(
            '[rollipop:resolve-asset-called] ' +
              'react-native/Libraries/Image/resolveAssetSource.js no longer matches the ' +
              'expected "function + export default resolveAssetSource" shape. The ' +
              'self-referential default-export interop fix was NOT applied. This likely ' +
              'means React Native changed the module; the Image component may crash at ' +
              'runtime. Update this plugin or fix the @rollipop/rolldown format plugin.',
          );
          return null;
        }

        // Collect every `resolveAssetSource.<prop> = <prop>;` mutation and
        // rewrite each target to `_resolveAssetSourceImpl.<prop>` so the
        // property bindings attach to the private impl, not the exported const.
        const props: string[] = [];
        const rewrittenCode = code
          // Rename the implementation function so the exported name is free.
          .replace(/function\s+resolveAssetSource\s*\(/, 'function _resolveAssetSourceImpl(')
          // Rewrite each mutation line to target the private impl.
          .replace(MUTATION_LINE_RE, (_m, prop: string, value: string) => {
            props.push(prop);
            return `_resolveAssetSourceImpl.${prop} = ${value};`;
          });

        if (props.length === 0) {
          const warn = typeof this?.warn === 'function' ? this.warn.bind(this) : console.warn;
          warn(
            '[rollipop:resolve-asset-source-interop] ' +
              'matched resolveAssetSource but found no `resolveAssetSource.<prop> = <prop>` ' +
              'mutations. The self-referential interop fix was NOT applied; the Image ' +
              'component may crash at runtime. Update this plugin or fix the ' +
              '@rollipop/rolldown format plugin.',
          );
          return null;
        }

        // Build the exported const from the collected props, then replace the
        // default export with it. This breaks the self-reference: the exported
        // `resolveAssetSource` is a fresh `Object.assign` result that is never
        // mutated after being exported.
        const shimDeclaration =
          'const resolveAssetSource = Object.assign(_resolveAssetSourceImpl, {\n' +
          props.map((prop) => `  ${prop},`).join('\n') +
          '\n});\n';

        const finalCode = rewrittenCode.replace(
          DEFAULT_EXPORT_RE,
          `${shimDeclaration}export default resolveAssetSource;`,
        );

        // Defensive: if the replace did not take effect, do not emit a broken
        // module — return the original and warn.
        if (finalCode === rewrittenCode) {
          const warn = typeof this?.warn === 'function' ? this.warn.bind(this) : console.warn;
          warn(
            '[rollipop:resolve-asset-source-interop] ' +
              'matched the resolveAssetSource shape but the rewrite did not apply. ' +
              'Skipping the transform to avoid emitting a broken module.',
          );
          return null;
        }

        return { code: finalCode, moduleType: 'js' };
      },
    },
  };
}

export { selfRefDefaultInteropPlugin };
