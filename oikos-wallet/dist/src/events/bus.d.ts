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
export declare class EventBus {
    private handlers;
    private recentEvents;
    /** Emit events to all subscribers and buffer them */
    emit(events: StreamEvent[]): void;
    /** Subscribe to events */
    onEvents(handler: (events: StreamEvent[]) => void): void;
    /** Get recent buffered events */
    getRecent(limit?: number): StreamEvent[];
    /** Get total event count */
    get count(): number;
}
//# sourceMappingURL=bus.d.ts.map