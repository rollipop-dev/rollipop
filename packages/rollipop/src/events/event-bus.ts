import type { ReportableEvent } from './types';

export type EventListener = (event: ReportableEvent) => void;

export class EventBus {
  private listeners = new Set<EventListener>();

  emit(event: ReportableEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
