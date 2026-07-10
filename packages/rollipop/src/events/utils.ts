import type { ReportableEvent } from './types';

export function isEventForBundler(
  event: ReportableEvent,
  bundlerId: string,
): event is ReportableEvent & { bundlerId: string } {
  return event.bundlerId === bundlerId;
}
