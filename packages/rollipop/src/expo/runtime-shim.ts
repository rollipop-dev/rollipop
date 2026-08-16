/**
 * Rollipop-compatible shim for `@expo/metro-runtime`.
 *
 * Expo Router, the error overlay (`expo/build/error-overlay`) and the
 * `@expo/metro-runtime` entry import a handful of runtime helpers that Metro
 * injects (HMR client, red-box formatting, async bundle loading). When Rollipop
 * is the bundler (no Metro), those imports must still resolve, so this module
 * provides the same named export surface with Rollipop-appropriate behavior:
 *
 * - HMR / reload are delegated to `import.meta.hot` when present (Rollipop's
 *   dev engine), otherwise no-ops in production.
 * - Error overlay + LogBox helpers are lightweight no-ops (Rollipop ships its
 *   own overlay); `createRuntimeError` preserves the error object so callers
 *   that re-throw still work. `withErrorOverlay` is a proper error boundary.
 * - `loadBundleAsync` / `clearSegmentCache` are async no-ops (segment preloading
 *   is a Metro concept; Rollipop serves the whole graph from one bundle).
 *
 * The export names intentionally match `@expo/metro-runtime`'s public API so the
 * existing imports in the Expo dependency tree keep working unchanged.
 */

import React from 'react';

const noop = (): void => {};

export function withErrorOverlay<P extends object>(
  Component: React.ComponentType<P>,
): React.ComponentType<P> {
  // `@expo/metro-runtime/error-overlay` exports `withErrorOverlay`, which wraps
  // the root component in an error boundary that renders the dev error overlay.
  // Rollipop ships its own LogBox-based overlay, so our boundary surfaces render
  // errors once (via `console.error` in `componentDidCatch`) and then renders a
  // minimal fallback UI. We deliberately do NOT re-throw in `render()`: once
  // `getDerivedStateFromError` has captured the error into state, re-throwing in
  // `render` propagates to the nearest parent boundary — and there is none above
  // the root — which turns a recoverable render error into an unhandled crash /
  // white screen. Rendering a fallback instead keeps the app alive and lets the
  // dev overlay (LogBox) show the captured error.
  const Boundary = class WithErrorOverlay extends React.Component<P, { error: Error | null }> {
    constructor(props: P) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error: Error) {
      return { error };
    }
    componentDidCatch(error: Error) {
      // Log exactly once. Do NOT also re-throw in render().
      console.error(error);
    }
    render() {
      if (this.state.error) {
        // Minimal, dependency-free fallback so the app does not white-screen.
        // The captured error is already logged above and shown by LogBox.
        return React.createElement(
          'div',
          {
            style: {
              flex: 1,
              padding: 16,
              color: '#fff',
              backgroundColor: '#a00',
              fontFamily: 'monospace',
              fontSize: 12,
            },
          },
          this.state.error.message,
        );
      }
      return React.createElement(Component, this.props as P);
    }
  };
  return Boundary as unknown as React.ComponentType<P>;
}

export function createRuntimeError(message: string, stack?: string | null): Error {
  const error = new Error(message);
  if (stack) {
    error.stack = stack;
  }
  return error;
}

export function getDevServer(): { url: string } | null {
  // The dev server origin is provided out-of-band by Rollipop's dev engine via
  // an env var (set when `rollipop start` launches). We read it from
  // `process.env` (reliable on RN) rather than `import.meta.env`, because the
  // `import.meta.env` member access is statically replaced with `({})` for
  // Hermes compatibility, so it can never carry a real value. Returns null when
  // not running against a dev server (e.g. production), which is the correct
  // "no dev server available" contract.
  const url =
    typeof process !== 'undefined'
      ? (process.env.ROLLIPOP_DEV_SERVER_URL ?? process.env.EXPO_PACKAGER_PROXY_URL ?? null)
      : null;
  return url ? { url } : null;
}

export function enableExperimental(_featureName: string): void {
  // No Metro experimental flags under Rollipop; accepted for API parity.
}

export function clearSegmentCache(): void {
  // Segment preloading is unused under the single-bundle Rollipop model.
}

export async function loadBundleAsync(_bundlePath: string): Promise<void> {
  // Rollipop serves the entire module graph in one bundle; there are no
  // separately-loadable Metro segments to fetch.
  return Promise.resolve();
}

export function reload(): void {
  const globalLocation =
    typeof globalThis !== 'undefined'
      ? (globalThis as unknown as { location?: { reload?: () => void } }).location
      : undefined;
  if (typeof import.meta !== 'undefined' && (import.meta as { hot?: unknown }).hot) {
    (import.meta as unknown as { hot: { invalidate: (s?: string) => void } }).hot.invalidate();
  } else if (globalLocation && typeof globalLocation.reload === 'function') {
    globalLocation.reload();
  }
}

export const LogBox = {
  ignoreAllLogs: noop,
  ignoreLogs: noop,
  ignoreWarnings: noop,
  install: noop,
  uninstall: noop,
  addException: noop,
  clear: noop,
};

export const __mapper = new Map<string, string>();

export function setMapper(_mapper: Map<string, string>): void {
  // Metro maps minified -> original module ids for the overlay; Rollipop source
  // maps already carry that information, so this is a no-op for parity.
}

export default {
  createRuntimeError,
  getDevServer,
  enableExperimental,
  clearSegmentCache,
  loadBundleAsync,
  reload,
  LogBox,
  __mapper,
  setMapper,
};
