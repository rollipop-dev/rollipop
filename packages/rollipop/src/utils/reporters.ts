import type { ReportableEvent, Reporter } from '../types';

export function mergeReporters(reporters: Reporter[]): Reporter {
  return {
    update(event: ReportableEvent): void {
      reporters.forEach((reporter) => reporter.update(event));
    },
  };
}
