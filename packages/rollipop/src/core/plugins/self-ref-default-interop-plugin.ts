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
 *     pickScale, setCustomSourceTransformer, addCustomSourceTransformer,
 *   });
 *   export default resolveAssetSource;
 *
 * NOTE: this is a stop-gap at the Rollipop layer. The proper fix belongs in the
 * `@rollipop/rolldown` format plugin (the self-referential default interop).
 * TRACKED DEBT: when that is fixed, this plugin can be removed. If React Native
 * ever changes the shape of `resolveAssetSource.js` so the rewrite below no
 * longer matches, we emit a loud warning instead of silently no-op'ing — a
 * silent no-op would resurrect the dropped-body crash with no diagnosability.
 */
const RESOLVE_ASSET_SOURCE_FILTER = [include(id(new RegExp('resolveAssetSource\\.js$')))];

// The exact block we rewrite: the three property mutations immediately followed
// by the default export. Anchored with `\s*` so minor whitespace changes still
// match, but a structural change (renamed prop, extra mutation, reordering) will
// not — and we want that to be *visible*, hence the warning path below.
const MUTATION_BLOCK_RE =
  /resolveAssetSource\.pickScale = pickScale;\s*\n\s*resolveAssetSource\.setCustomSourceTransformer = setCustomSourceTransformer;\s*\n\s*resolveAssetSource\.addCustomSourceTransformer = addCustomSourceTransformer;\s*\n\s*export default resolveAssetSource;/;

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

        // This is the RN resolveAssetSource module. If the expected mutation
        // block is present, rewrite it. If it is NOT present, the module shape
        // has drifted from what we understand — warn loudly rather than silently
        // passing through, because a pass-through here means the self-ref bug
        // (and the dropped-body crash) comes back with zero diagnosability.
        if (!MUTATION_BLOCK_RE.test(code)) {
          const warn = typeof this?.warn === 'function' ? this.warn.bind(this) : console.warn;
          warn(
            '[rollipop:resolve-asset-source-interop] ' +
              'react-native/Libraries/Image/resolveAssetSource.js no longer matches the ' +
              'expected "fn + prop mutations + export default" shape. The self-referential ' +
              'default-export interop fix was NOT applied. This likely means React Native ' +
              'changed the module; the Image component may crash at runtime. ' +
              'Update this plugin or fix the @rollipop/rolldown format plugin.',
          );
          return null;
        }

        const renamed = code.replace(
          /function resolveAssetSource\(/,
          'function _resolveAssetSourceImpl(',
        );

        const rewritten = renamed.replace(
          MUTATION_BLOCK_RE,
          'const resolveAssetSource = Object.assign(_resolveAssetSourceImpl, {\n' +
            '  pickScale,\n' +
            '  setCustomSourceTransformer,\n' +
            '  addCustomSourceTransformer,\n' +
            '});\n' +
            'export default resolveAssetSource;',
        );

        // Defensive: if the replace did not take effect, do not emit a broken
        // module — return the original and warn.
        if (rewritten === renamed) {
          const warn = typeof this?.warn === 'function' ? this.warn.bind(this) : console.warn;
          warn(
            '[rollipop:resolve-asset-source-interop] ' +
              'matched the resolveAssetSource mutation block but the rewrite did not apply. ' +
              'Skipping the transform to avoid emitting a broken module.',
          );
          return null;
        }

        return { code: rewritten, moduleType: 'js' };
      },
    },
  };
}

export { selfRefDefaultInteropPlugin };
