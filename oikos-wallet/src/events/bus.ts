/**
 * EventBus — pub/sub for wallet and blockchain events.
 *
 * Replaces the brain's direct event handling. Any connected agent
 * can subscribe to events via MCP (get_events) or REST (/api/events).
 *
 * Events are buffered (last 200) so agents that connect late can
 * catch up on recent activity.
 */

import type { StreamEvent } from './types.js';

const MAX_BUFFER_SIZE = 200;

export class EventBus {
  private handlers: Array<(events: StreamEvent[]) => void> = [];
  private recentEvents: StreamEvent[] = [];

  /** Emit events to all subscribers and buffer them */
  emit(events: StreamEvent[]): void {
    if (events.length === 0) return;

    // Buffer
    this.recentEvents.push(...events);
    if (this.recentEvents.length > MAX_BUFFER_SIZE) {
      this.recentEvents = this.recentEvents.slice(-MAX_BUFFER_SIZE);
    }

    // Notify subscribers
    for (const handler of this.handlers) {
      try {
        handler(events);
      } catch (err) {
        console.error('[events] Handler error:', err);
      }
    }
  }

  /** Subscribe to events */
  onEvents(handler: (events: StreamEvent[]) => void): void {
    this.handlers.push(handler);
  }

  /** Get recent buffered events */
  getRecent(limit = 50): StreamEvent[] {
    return this.recentEvents.slice(-limit);
  }

  /** Get total event count */
  get count(): number {
    return this.recentEvents.length;
  }
}
