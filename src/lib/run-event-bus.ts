import { EventEmitter } from 'node:events';

export type RunEvent =
  | { type: 'phase'; phase: string; message: string }
  | { type: 'cli_text'; text: string }
  | { type: 'cli_thinking'; text: string }
  | { type: 'done'; status: string; error_message?: string }
  | { type: 'error'; message: string }
  | { type: 'chat_text'; text: string }
  | { type: 'chat_done' };

export interface BufferedEvent {
  eventId: number;
  event: RunEvent;
}

class RunEventBus {
  private emitter = new EventEmitter();
  private buffers = new Map<string, BufferedEvent[]>();
  private counters = new Map<string, number>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor() {
    this.emitter.setMaxListeners(100);
  }

  emit(runId: string, event: RunEvent): number {
    const counter = (this.counters.get(runId) ?? 0) + 1;
    this.counters.set(runId, counter);

    const buffered: BufferedEvent = { eventId: counter, event };

    let buf = this.buffers.get(runId);
    if (!buf) {
      buf = [];
      this.buffers.set(runId, buf);
    }
    buf.push(buffered);

    this.emitter.emit(`run:${runId}`, buffered);

    if (event.type === 'done' || event.type === 'chat_done') {
      this.scheduleCleanup(runId);
    }

    return counter;
  }

  subscribe(runId: string, listener: (event: BufferedEvent) => void): () => void {
    const channel = `run:${runId}`;
    this.emitter.on(channel, listener);
    return () => {
      this.emitter.off(channel, listener);
    };
  }

  getBufferedEvents(runId: string, afterEventId?: number): BufferedEvent[] {
    const buf = this.buffers.get(runId) ?? [];
    if (afterEventId == null) return buf;
    return buf.filter((e) => e.eventId > afterEventId);
  }

  private scheduleCleanup(runId: string): void {
    const existing = this.cleanupTimers.get(runId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.buffers.delete(runId);
      this.counters.delete(runId);
      this.cleanupTimers.delete(runId);
    }, 60_000);

    this.cleanupTimers.set(runId, timer);
  }
}

export const runEventBus = new RunEventBus();
