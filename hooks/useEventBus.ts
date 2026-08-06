"use client";

type Listener<T = unknown> = (data: T) => void;

interface EventMap {
  'task:status-change': { taskId: string; status: string; progress: number };
  'task:completed': { taskId: string; result?: unknown };
  'task:failed': { taskId: string; error: string };
  'download:progress': { downloadId: string; progress: number; status: string };
  'download:completed': { downloadId: string };
  'download:failed': { downloadId: string; error: string };
  'install:progress': { modelId: string; progress: number; status: string };
  'install:completed': { modelId: string };
  'install:failed': { modelId: string; error: string };
  'generation:started': { jobId: string };
  'generation:completed': { jobId: string; result: unknown };
  'generation:failed': { jobId: string; error: string };
  'generation:cancelled': { jobId: string };
  'job:status-update': { jobId: string; status: string; progress: number };
  'model:installed': { modelId: string };
  'model:uninstalled': { modelId: string };
  'settings:changed': { key: string; value: unknown };
  'ui:state-change': { key: string; value: unknown };
}

class EventBus {
  private listeners: Map<keyof EventMap, Set<Listener>> = new Map();
  private static instance: EventBus | null = null;

  private constructor() {}

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener as Listener);

    return () => {
      this.listeners.get(event)?.delete(listener as Listener);
    };
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener);
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

let eventBusInstance: EventBus | null = null;

export function getEventBus(): EventBus {
  if (!eventBusInstance) {
    eventBusInstance = EventBus.getInstance();
  }
  return eventBusInstance;
}

export function useEventBus() {
  return getEventBus();
}