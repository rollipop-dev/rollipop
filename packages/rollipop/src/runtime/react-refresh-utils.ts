import type {
  createSignatureFunctionForTransform,
  register,
  getFamilyByType,
  performReactRefresh,
  isLikelyComponentType,
} from 'react-refresh';

declare global {
  /**
   * Injects by `react-native/Libraries/Core/setUpReactRefresh.js`.
   */
  var __ReactRefresh:
    | {
        createSignatureFunctionForTransform: typeof createSignatureFunctionForTransform;
        register: typeof register;
        isLikelyComponentType: typeof isLikelyComponentType;
        getFamilyByType: typeof getFamilyByType;
        performReactRefresh: typeof performReactRefresh;
        performFullRefresh: (reason: unknown) => void;
      }
    | undefined;
}

export type ReactRefresh = {
  isReactRefreshBoundary: typeof isReactRefreshBoundary;
  enqueueUpdate: typeof enqueueUpdate;
} & NonNullable<typeof __ReactRefresh>;

export const lazyReactRefresh = (function () {
  const keys: (keyof NonNullable<typeof __ReactRefresh>)[] = [
    'createSignatureFunctionForTransform',
    'register',
    'isLikelyComponentType',
    'getFamilyByType',
    'performReactRefresh',
    'performFullRefresh',
  ];

  const holder = {
    isReactRefreshBoundary,
    enqueueUpdate,
  };

  function defineLazyProperty<Target extends object>(
    target: Target,
    key: keyof NonNullable<typeof globalThis.__ReactRefresh>,
  ) {
    Object.defineProperty(target, key, {
      enumerable: true,
      configurable: true,
      get: function () {
        var reactRefresh = globalThis.__ReactRefresh;
        if (reactRefresh == null) {
          return undefined;
        }
        return reactRefresh[key];
      },
    });
  }

  for (var i = 0; i < keys.length; i++) {
    // `__ReactRefresh` is injected only after the runtime code has run.
    // Use a getter to resolve its properties lazily on access.
    defineLazyProperty(holder, keys[i]);
  }

  return holder as ReactRefresh;
})();

function isReactRefreshBoundary(moduleExports: Record<string, unknown>) {
  if (lazyReactRefresh.isLikelyComponentType(moduleExports)) {
    return true;
  }

  if (moduleExports === undefined || moduleExports === null || typeof moduleExports !== 'object') {
    return false;
  }

  var hasExports = false;
  var areAllExportsComponents = true;
  for (var key in moduleExports) {
    hasExports = true;

    if (key === '__esModule') {
      continue;
    }

    var exportValue = moduleExports[key];
    if (!lazyReactRefresh.isLikelyComponentType(exportValue)) {
      areAllExportsComponents = false;
    }
  }

  return hasExports && areAllExportsComponents;
}

let timer: NodeJS.Timeout | null = null;
function enqueueUpdate() {
  if (timer) {
    return;
  }
  timer = setTimeout(() => {
    lazyReactRefresh.performReactRefresh();
    timer = null;
  }, 50);
}
