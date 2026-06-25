import type { HMRCustomHandler } from './types/hmr';
import type { RollipopDevRuntime } from './types/runtime';

declare var __DEV__: boolean;

declare global {
  var __rollipop_runtime__: RollipopDevRuntime | undefined;
}

/**
 * Set a custom HMR handler.
 *
 * @param handler - The custom HMR handler to set.
 */
export function setCustomHMRHandler(handler: HMRCustomHandler) {
  if (__DEV__ && globalThis.__rollipop_runtime__ != null) {
    if (globalThis.__rollipop_runtime__.customHMRHandler != null) {
      console.warn('Custom HMR handler already set. replacing existing handler.');
    }
    globalThis.__rollipop_runtime__.customHMRHandler = handler;
  }
}
