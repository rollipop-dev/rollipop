import type { ReportableEvent } from './events/types';

export type { BuildDiagnosticLog, ReportableEvent } from './events/types';

// Utility Types
export type MaybePromise<T> = T | Promise<T>;
export type NullValue<T = void> = T | undefined | null | void;
export type DeepRequired<T> = {
  [K in keyof T]-?: T[K] extends object ? DeepRequired<T[K]> : T[K];
};

export interface Reporter {
  update(event: ReportableEvent): void;
}

export interface PackageJson {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
