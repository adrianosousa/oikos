/**
 * Mock Event Source — 5-minute simulated stream.
 *
 * Generates a realistic sequence of events for demo/testing:
 * Min 0-1: Low activity, quiet chat
 * Min 2: Viewer count crosses 100 → milestone
 * Min 3: Engagement spike, positive sentiment
 * Min 4: Large donation → excitement wave
 * Min 5: Agent should hit session limit → policy enforcement
 */
import type { EventSource, StreamEvent } from './types.js';
export declare class MockEventSource implements EventSource {
    private timeline;
    private timelineIndex;
    private timer;
    private handler;
    private startTime;
    constructor();
    onEvents(handler: (events: StreamEvent[]) => void): void;
    start(): void;
    stop(): void;
    private scheduleNext;
}
//# sourceMappingURL=mock.d.ts.map