import type { ServerEvent } from './types';

export type EventListener<Event> = (event: Event) => void;

export class EventBus<Event> {
  private listeners = new Set<EventListener<Event>>();

  emit(event: Event): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: EventListener<Event>): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class ServerEventBus extends EventBus<ServerEvent> {}
