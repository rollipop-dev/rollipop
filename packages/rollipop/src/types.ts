// Utility Types
export type MaybePromise<T> = T | Promise<T>;
export type NullValue<T = void> = T | undefined | null | void;
export type DeepRequired<T> = {
  [K in keyof T]-?: T[K] extends object ? DeepRequired<T[K]> : T[K];
};

export interface Reporter {
  update(event: ReportableEvent): void;
}

interface OptionalBundlerEvent {
  bundlerId?: string;
}

export type ReportableEvent =
  | ({
      type: 'bundle_build_started';
    } & OptionalBundlerEvent)
  | ({
      type: 'bundle_build_done';
      totalModules: number;
      duration: number;
    } & OptionalBundlerEvent)
  | ({
      type: 'bundle_build_failed';
      error: Error;
    } & OptionalBundlerEvent)
  | ({
      type: 'transform';
      id: string;
      totalModules: number | undefined;
      transformedModules: number;
    } & OptionalBundlerEvent)
  | ({
      type: 'watch_change';
      id: string;
    } & OptionalBundlerEvent)
  | MetroCompatibleClientLogEvent;

export type MetroCompatibleClientLogEvent = {
  type: 'client_log';
  level:
    | 'trace'
    | 'info'
    | 'warn'
    | 'log'
    | 'group'
    | 'groupCollapsed'
    | 'groupEnd'
    | 'debug'
    /**
     * In react-native, ReportableEvent['level'] does not defined `error` type.
     * But, Flipper supports the `error` type.
     *
     * @see https://github.com/facebook/flipper/blob/v0.273.0/desktop/flipper-common/src/server-types.tsx#L74
     */
    | 'error';
  data: any[];
  bundlerId?: string;
};

export interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
