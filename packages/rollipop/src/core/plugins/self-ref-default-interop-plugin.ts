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
 * This is a stop-gap at the Rollipop layer; the proper fix is in the
 * `@rollipop/rolldown` format plugin (the self-referential default interop).
 */
const RESOLVE_ASSET_SOURCE_FILTER = [
  include(id(new RegExp('resolveAssetSource\\.js$'))),
];

function selfRefDefaultInteropPlugin(): rolldown.Plugin | null {
  return {
    name: 'rollipop:resolve-asset-source-interop',
    transform: {
      filter: RESOLVE_ASSET_SOURCE_FILTER,
      handler(code: string) {
        if (!code.includes('export default resolveAssetSource;')) {
          return null;
        }

        const renamed = code.replace(
          /function resolveAssetSource\(/,
          'function _resolveAssetSourceImpl(',
        );

        const rewritten = renamed.replace(
          /resolveAssetSource\.pickScale = pickScale;\s*\n\s*resolveAssetSource\.setCustomSourceTransformer = setCustomSourceTransformer;\s*\n\s*resolveAssetSource\.addCustomSourceTransformer = addCustomSourceTransformer;\s*\n\s*export default resolveAssetSource;/,
          'const resolveAssetSource = Object.assign(_resolveAssetSourceImpl, {\n' +
            '  pickScale,\n' +
            '  setCustomSourceTransformer,\n' +
            '  addCustomSourceTransformer,\n' +
            '});\n' +
            'export default resolveAssetSource;',
        );

        // If the source did not match the expected shape, leave it untouched
        // rather than emitting something broken.
        if (rewritten === renamed) {
          return null;
        }

        return { code: rewritten, moduleType: 'js' };
      },
    },
  };
}

export { selfRefDefaultInteropPlugin };
