import { AppState, Dimensions, Platform, StyleSheet } from 'react-native';

import Logo from '../../logo.svg';
import { appDescription } from './env';

export type RuntimeCheckGroup = 'Bundler transforms' | 'React Native runtime';

export type RuntimeCheckResult = {
  message: string;
  passed: boolean;
};

export type RuntimeCheckDefinition = {
  expectation: string;
  group: RuntimeCheckGroup;
  id: string;
  run: () => Promise<RuntimeCheckResult> | RuntimeCheckResult;
  title: string;
};

export type RuntimeCheckReport = RuntimeCheckDefinition &
  RuntimeCheckResult & {
    durationMs: number;
    status: 'failed' | 'passed';
  };

function result(passed: boolean, message: string): RuntimeCheckResult {
  return { message, passed };
}

export const runtimeChecks: RuntimeCheckDefinition[] = [
  {
    expectation: 'ROLLIPOP_DESCRIPTION is available through import.meta.env.',
    group: 'Bundler transforms',
    id: 'env-description',
    run: () => {
      const description = appDescription.trim();
      return result(description.length > 0, `Loaded "${description || 'empty'}"`);
    },
    title: 'Env replacement',
  },
  {
    expectation: 'The SVG plugin turns logo.svg into a renderable module.',
    group: 'Bundler transforms',
    id: 'svg-transform',
    run: () => {
      const moduleType = typeof Logo;
      return result(
        moduleType === 'function' || moduleType === 'object' || moduleType === 'string',
        `logo.svg resolved as ${moduleType}`,
      );
    },
    title: 'SVG import',
  },
  {
    expectation: 'Promise boundaries resolve in the bundled runtime.',
    group: 'Bundler transforms',
    id: 'async-boundary',
    run: async () => {
      const value = await Promise.resolve(['roll', 'i', 'pop'].join(''));
      return result(value === 'rollipop', `Resolved async value "${value}"`);
    },
    title: 'Async execution',
  },
  {
    expectation: 'The dev runtime exposes import.meta.hot when HMR is enabled.',
    group: 'Bundler transforms',
    id: 'hmr-runtime',
    run: () => {
      const hot = import.meta.hot;
      return result(
        hot == null || typeof hot === 'object',
        hot ? 'import.meta.hot is available' : 'HMR is disabled for this runtime',
      );
    },
    title: 'HMR boundary',
  },
  {
    expectation: 'Platform.select returns a native platform branch.',
    group: 'React Native runtime',
    id: 'platform-select',
    run: () => {
      const branch = Platform.select({
        android: 'android',
        default: 'default',
        ios: 'ios',
      });
      return result(typeof branch === 'string', `Selected ${branch}`);
    },
    title: 'Platform selection',
  },
  {
    expectation: 'Dimensions reports a non-zero window size.',
    group: 'React Native runtime',
    id: 'dimensions',
    run: () => {
      const window = Dimensions.get('window');
      return result(
        window.width > 0 && window.height > 0,
        `${Math.round(window.width)} x ${Math.round(window.height)}`,
      );
    },
    title: 'Device dimensions',
  },
  {
    expectation: 'StyleSheet.flatten preserves the latest style values.',
    group: 'React Native runtime',
    id: 'stylesheet-flatten',
    run: () => {
      const flattened = StyleSheet.flatten([{ padding: 4 }, { opacity: 0.8, padding: 12 }]);
      return result(
        flattened?.padding === 12 && flattened.opacity === 0.8,
        `padding=${flattened?.padding}, opacity=${flattened?.opacity}`,
      );
    },
    title: 'StyleSheet flatten',
  },
  {
    expectation: 'AppState subscriptions return a removable listener handle.',
    group: 'React Native runtime',
    id: 'app-state',
    run: () => {
      const subscription = AppState.addEventListener('change', () => {});
      const removable = typeof subscription.remove === 'function';
      subscription.remove();
      return result(removable, removable ? 'remove() is available' : 'remove() missing');
    },
    title: 'AppState listener',
  },
];

export async function runRuntimeChecks(
  definitions: RuntimeCheckDefinition[] = runtimeChecks,
): Promise<RuntimeCheckReport[]> {
  const reports: RuntimeCheckReport[] = [];

  for (const definition of definitions) {
    const startedAt = Date.now();

    try {
      const checkResult = await definition.run();
      reports.push({
        ...definition,
        ...checkResult,
        durationMs: Date.now() - startedAt,
        status: checkResult.passed ? 'passed' : 'failed',
      });
    } catch (error) {
      reports.push({
        ...definition,
        durationMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : 'Unknown error',
        passed: false,
        status: 'failed',
      });
    }
  }

  return reports;
}

export function summarizeReports(reports: RuntimeCheckReport[]) {
  const passed = reports.filter((report) => report.status === 'passed').length;

  return {
    failed: reports.length - passed,
    passed,
    total: reports.length,
  };
}
